import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { actor, HttpError, integer, scalar } from '../http.js';

type Actor = ReturnType<typeof actor>;
type Contacto = {
  id: string; id_agencia: number; nombre_completo: string; correo: string | null;
  telefono: string | null; deleted_at: string | null; deleted_by: string | null;
  created_by: string; updated_by: string;
};

// ---------------------------------------------------------------------------
// NORMALIZACIÓN Y VALIDACIÓN (todo error aquí es 400, antes de tocar la base)
function normalizarNombre(v: unknown): string {
  if (typeof v !== 'string' || v.length > 150) throw new HttpError(400, 'Nombre inválido');
  const nombre = v.trim();
  if (!nombre) throw new HttpError(400, 'El nombre es obligatorio');
  return nombre;
}

function normalizarCorreo(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.length > 255) throw new HttpError(400, 'Correo inválido');
  const correo = v.trim().toLowerCase();
  if (!correo) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new HttpError(400, 'Correo inválido');
  return correo;
}

function normalizarTelefono(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.length > 30) throw new HttpError(400, 'Teléfono inválido');
  const tel = v.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return tel || null;
}

function leerCuerpo(body: unknown) {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw new HttpError(400, 'El cuerpo debe ser un objeto JSON');
  const b = body as Record<string, unknown>;
  return {
    nombre: normalizarNombre(b.nombre_completo),
    correo: normalizarCorreo(b.correo),
    telefono: normalizarTelefono(b.telefono),
  };
}

// ---------------------------------------------------------------------------
// PERMISOS: rol (403), existencia de la agencia (404), propiedad (403)
function exigirAgencia(db: Db, u: Actor, idAgencia: number) {
  if (u.role !== 'admin' && u.role !== 'asesor') throw new HttpError(403, 'Sin permiso');
  const agencia = db.get<{ id: number; advisor_id: string | null }>(
    'SELECT id, advisor_id FROM agencias WHERE id=? AND deleted_at IS NULL', [idAgencia]);
  if (!agencia) throw new HttpError(404, 'Agencia no encontrada');
  if (u.role === 'asesor' && agencia.advisor_id !== u.id) throw new HttpError(403, 'Sin permiso');
}

// Un contacto ajeno a la agencia de la URL es 404, incluso para admin.
function buscarContacto(db: Db, idAgencia: number, id: string): Contacto {
  const c = db.get<Contacto>('SELECT * FROM contactos WHERE id=? AND id_agencia=?', [id, idAgencia]);
  if (!c) throw new HttpError(404, 'Contacto no encontrado');
  return c;
}

// COINCIDENCIAS: otros contactos ACTIVOS de la misma agencia con igual correo o teléfono.
function coincidencias(db: Db, idAgencia: number, propioId: string, correo: string | null, telefono: string | null) {
  return db.all<{ id: string; nombre_completo: string }>(
    `SELECT id, nombre_completo FROM contactos
     WHERE id_agencia=? AND deleted_at IS NULL AND id<>?
       AND (correo=? OR telefono=?)`,
    [idAgencia, propioId, correo, telefono]);
}

// AUDITORÍA: siempre dentro de la misma transacción del cambio.
function registrarEvento(db: Db, accion: string, actorId: string, anterior: Contacto | null, nuevo: Contacto, now: string) {
  db.run(
    'INSERT INTO eventos(contacto_id,accion,actor_id,anterior,nuevo,created_at) VALUES(?,?,?,?,?,?)',
    [nuevo.id, accion, actorId, anterior ? JSON.stringify(anterior) : null, JSON.stringify(nuevo), now]);
}

const escaparLike = (s: string) => s.replace(/[\\%_]/g, c => '\\' + c);

export function contactosRouter(db: Db) {
  // server.ts monta este router en /agencias, así que montamos el sub-router
  // en /:agencia/asesores. mergeParams permite leer :agencia dentro de él.
  const router = Router();
  const r = Router({ mergeParams: true });
  router.use('/:agencia/asesores', r);

  // Autenticación (401) y permisos de agencia para todas las rutas.
  r.use((req, res, next) => {
    const u = actor(req);
    const idAgencia = integer(req.params.agencia, 0, 1, 1000000);
    exigirAgencia(db, u, idAgencia);
    res.locals.idAgencia = idAgencia;
    next();
  });

  // LISTADO
  r.get('/', (req, res) => {
    const idAgencia: number = res.locals.idAgencia;
    const page = integer(req.query.page, 1, 1, 1000000);
    const limit = integer(req.query.limit, 20, 1, 100);
    const vista = scalar(req.query.vista, 'activos');
    if (vista !== 'activos' && vista !== 'eliminados') throw new HttpError(400, 'Vista inválida');
    const search = scalar(req.query.search, '');
    if (search.length > 150) throw new HttpError(400, 'Búsqueda demasiado larga');

    const where = ['id_agencia=?', vista === 'activos' ? 'deleted_at IS NULL' : 'deleted_at IS NOT NULL'];
    const params: (string | number)[] = [idAgencia];
    if (search) {
      const patron = `%${escaparLike(search)}%`;
      where.push(`(nombre_completo LIKE ? ESCAPE '\\' OR correo LIKE ? ESCAPE '\\' OR telefono LIKE ? ESCAPE '\\')`);
      params.push(patron, patron, patron);
    }
    const total = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM contactos WHERE ${where.join(' AND ')}`, params)?.n ?? 0;
    const items = db.all(
      `SELECT * FROM contactos WHERE ${where.join(' AND ')}
       ORDER BY LOWER(nombre_completo), id ASC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]);
    res.json({ items, total, page, limit });
  });

  // CREACIÓN
  r.post('/', (req, res) => {
    const u = actor(req), idAgencia: number = res.locals.idAgencia;
    const { nombre, correo, telefono } = leerCuerpo(req.body);
    const id = randomUUID(), now = new Date().toISOString();
    const item = db.transaction(() => {
      db.run(
        `INSERT INTO contactos(id,id_agencia,nombre_completo,correo,telefono,deleted_at,deleted_by,created_by,updated_by)
         VALUES(?,?,?,?,?,NULL,NULL,?,?)`,
        [id, idAgencia, nombre, correo, telefono, u.id, u.id]);
      const creado = buscarContacto(db, idAgencia, id);
      registrarEvento(db, 'creacion', u.id, null, creado, now);
      return creado;
    });
    res.status(201).json({ item, coincidencias: coincidencias(db, idAgencia, id, correo, telefono) });
  });

  // EDICIÓN (reemplazo completo; opcionales ausentes pasan a null)
  r.patch('/:id', (req, res) => {
    const u = actor(req), idAgencia: number = res.locals.idAgencia, id = String(req.params.id);
    const { nombre, correo, telefono } = leerCuerpo(req.body);
    const now = new Date().toISOString();
    const item = db.transaction(() => {
      const anterior = buscarContacto(db, idAgencia, id);
      if (anterior.deleted_at !== null) throw new HttpError(404, 'Contacto no encontrado');
      db.run('UPDATE contactos SET nombre_completo=?, correo=?, telefono=?, updated_by=? WHERE id=?',
        [nombre, correo, telefono, u.id, id]);
      const nuevo = buscarContacto(db, idAgencia, id);
      registrarEvento(db, 'actualizacion', u.id, anterior, nuevo, now); // siempre, aunque no cambien valores
      return nuevo;
    });
    res.json({ item, coincidencias: coincidencias(db, idAgencia, id, correo, telefono) });
  });

  // RESTAURACIÓN
  r.patch('/:id/restaurar', (req, res) => {
    const u = actor(req), idAgencia: number = res.locals.idAgencia, id = String(req.params.id);
    const now = new Date().toISOString();
    const item = db.transaction(() => {
      const anterior = buscarContacto(db, idAgencia, id);
      if (anterior.deleted_at === null) return anterior; // repetir: sin cambios ni eventos
      db.run('UPDATE contactos SET deleted_at=NULL, deleted_by=NULL, updated_by=? WHERE id=?', [u.id, id]);
      const nuevo = buscarContacto(db, idAgencia, id);
      registrarEvento(db, 'restauracion', u.id, anterior, nuevo, now);
      return nuevo;
    });
    res.json(item);
  });

  // BAJA LÓGICA
  r.delete('/:id', (req, res) => {
    const u = actor(req), idAgencia: number = res.locals.idAgencia, id = String(req.params.id);
    const now = new Date().toISOString();
    const item = db.transaction(() => {
      const anterior = buscarContacto(db, idAgencia, id);
      if (anterior.deleted_at !== null) return anterior; // repetir: sin cambios ni eventos
      db.run('UPDATE contactos SET deleted_at=?, deleted_by=?, updated_by=? WHERE id=?', [now, u.id, u.id, id]);
      const nuevo = buscarContacto(db, idAgencia, id);
      registrarEvento(db, 'baja', u.id, anterior, nuevo, now);
      return nuevo;
    });
    res.json(item);
  });

  // HISTORIAL (incluye contactos eliminados)
  r.get('/:id/historial', (req, res) => {
    const idAgencia: number = res.locals.idAgencia, id = String(req.params.id);
    buscarContacto(db, idAgencia, id);
    const filas = db.all<{ id: number; contacto_id: string; accion: string; actor_id: string;
      anterior: string | null; nuevo: string; created_at: string }>(
      'SELECT * FROM eventos WHERE contacto_id=? ORDER BY created_at DESC, id DESC', [id]);
    res.json(filas.map(e => ({
      ...e,
      anterior: e.anterior ? JSON.parse(e.anterior) : null,
      nuevo: JSON.parse(e.nuevo),
    })));
  });

  return router;
}