import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { actor, HttpError, integer, scalar, type Actor } from '../http.js';
// CASO 3: desarrolla las rutas, validaciones y transacciones del directorio.
// schema.sql, seed.sql y el contrato están listos. No cambies los datos iniciales.
function agenciaId(value: string): number {
  if (!/^\d+$/.test(value)) throw new HttpError(400, 'Agencia inválida');
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || id > 1000000) throw new HttpError(400, 'Agencia inválida');
  return id;
}
function resolveAgencia(db: Db, raw: string, user: Actor): number {
  const id = agenciaId(raw);
  const agencia = db.get<{ advisor_id: string | null }>(
    'SELECT advisor_id FROM agencias WHERE id=? AND deleted_at IS NULL', [id]);
  if (!agencia) throw new HttpError(404, 'Agencia no disponible');
  if (user.role !== 'admin' && agencia.advisor_id !== user.id) throw new HttpError(403, 'Agencia ajena');
  return id;
}
function texto(value: unknown, campo: string, max: number): string {
  if (typeof value !== 'string') throw new HttpError(400, `${campo} inválido`);
  if (value.length > max) throw new HttpError(400, `${campo} demasiado largo`);
  return value.trim();
}
function normNombre(value: unknown): string {
  const nombre = texto(value, 'nombre_completo', 150);
  if (!nombre) throw new HttpError(400, 'nombre_completo vacío');
  return nombre;
}
function normCorreo(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const correo = texto(value, 'correo', 255).toLowerCase();
  if (correo === '') return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new HttpError(400, 'correo inválido');
  return correo;
}
function normTelefono(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const limpio = texto(value, 'telefono', 30).replace(/[^+\d]/g, '');
  const resultado = limpio.startsWith('+') ? '+' + limpio.slice(1).replace(/\+/g, '') : limpio.replace(/\+/g, '');
  return resultado === '' ? null : resultado;
}
type Coincidencia = { id: string; nombre_completo: string };
function findCoincidencias(db: Db, idAgencia: number, correo: string | null, telefono: string | null, excluirId: string | null): Coincidencia[] {
  return db.all<Coincidencia>(
    `SELECT id, nombre_completo FROM contactos
     WHERE id_agencia = ? AND deleted_at IS NULL AND id != ?
       AND ((? IS NOT NULL AND correo = ?) OR (? IS NOT NULL AND telefono = ?))`,
    [idAgencia, excluirId ?? '', correo, correo, telefono, telefono]);
}
type ContactoRow = {
  id: string; id_agencia: number; nombre_completo: string;
  correo: string | null; telefono: string | null;
  deleted_at: string | null; deleted_by: string | null;
  created_by: string; updated_by: string;
};
type EventoRow = { id: number; contacto_id: string; accion: string; actor_id: string; anterior: string | null; nuevo: string; created_at: string };
function bodyObject(req: { body: unknown }): Record<string, unknown> {
  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) throw new HttpError(400, 'Cuerpo inválido');
  return req.body as Record<string, unknown>;
}
function parseContactos(input: unknown): { nombre_completo: unknown; correo: unknown; telefono: unknown } {
  const raw = input as { nombre_completo: unknown; correo: unknown; telefono: unknown };
  return { nombre_completo: raw.nombre_completo, correo: raw.correo, telefono: raw.telefono };
}
export function contactosRouter(db: Db) {
  const router = Router();
  const findContacto = (idAgencia: number, id: string) =>
    db.get<ContactoRow>('SELECT * FROM contactos WHERE id=? AND id_agencia=?', [id, idAgencia]);
  const evento = (contactoId: string, accion: string, actorId: string, anterior: ContactoRow | null, nuevo: ContactoRow) =>
    db.run(
      'INSERT INTO eventos(contacto_id,accion,actor_id,anterior,nuevo,created_at) VALUES(?,?,?,?,?,?)',
      [contactoId, accion, actorId, anterior === null ? null : JSON.stringify(anterior), JSON.stringify(nuevo), new Date().toISOString()]);
  router.get('/:agencia/asesores', (req, res) => {
    const user = actor(req);
    const idAgencia = resolveAgencia(db, req.params.agencia, user);
    const vista = scalar(req.query.vista, 'activos');
    if (vista !== 'activos' && vista !== 'eliminados') throw new HttpError(400, 'Vista inválida');
    const search = scalar(req.query.search);
    if (search.length > 150) throw new HttpError(400, 'Búsqueda demasiado larga');
    const page = integer(req.query.page, 1, 1, 1000000);
    const limit = integer(req.query.limit, 20, 1, 100);
    const condiciones = ['id_agencia = ?', vista === 'activos' ? 'deleted_at IS NULL' : 'deleted_at IS NOT NULL'];
    const params: (string | number)[] = [idAgencia];
    if (search) {
      condiciones.push('(instr(lower(nombre_completo), lower(?)) > 0 OR instr(lower(coalesce(correo, \' \')), lower(?)) > 0 OR instr(lower(coalesce(telefono, \' \')), lower(?)) > 0)');
      params.push(search, search, search);
    }
    const where = `WHERE ${condiciones.join(' AND ')}`;
    const total = db.get<{ total: number }>(`SELECT COUNT(*) AS total FROM contactos ${where}`, params).total;
    const items = db.all<ContactoRow>(`SELECT * FROM contactos ${where} ORDER BY nombre_completo COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
    res.json({ items, total, page, limit });
  });
  router.post('/:agencia/asesores', (req, res) => {
    const user = actor(req);
    const idAgencia = resolveAgencia(db, req.params.agencia, user);
    const raw = parseContactos(bodyObject(req));
    const nombre = normNombre(raw.nombre_completo);
    const correo = normCorreo(raw.correo);
    const telefono = normTelefono(raw.telefono);
    const id = randomUUID();
    const item: ContactoRow = { id, id_agencia: idAgencia, nombre_completo: nombre, correo, telefono, deleted_at: null, deleted_by: null, created_by: user.id, updated_by: user.id };
    const coincidencias = findCoincidencias(db, idAgencia, correo, telefono, null);
    db.transaction(() => {
      db.run('INSERT INTO contactos(id,id_agencia,nombre_completo,correo,telefono,deleted_at,deleted_by,created_by,updated_by) VALUES(?,?,?,?,?,NULL,NULL,?,?)',
        [id, idAgencia, nombre, correo, telefono, user.id, user.id]);
      evento(id, 'creacion', user.id, null, item);
    });
    res.status(201).json({ item, coincidencias });
  });
  router.patch('/:agencia/asesores/:id', (req, res) => {
    const user = actor(req);
    const idAgencia = resolveAgencia(db, req.params.agencia, user);
    const prev = findContacto(idAgencia, req.params.id);
    if (!prev || prev.deleted_at !== null) throw new HttpError(404, 'Contacto no disponible');
    const raw = parseContactos(bodyObject(req));
    const nombre = normNombre(raw.nombre_completo);
    const correo = normCorreo(raw.correo);
    const telefono = normTelefono(raw.telefono);
    const actual: ContactoRow = { ...prev, nombre_completo: nombre, correo, telefono, updated_by: user.id };
    const coincidencias = findCoincidencias(db, idAgencia, correo, telefono, prev.id);
    db.transaction(() => {
      db.run('UPDATE contactos SET nombre_completo=?, correo=?, telefono=?, updated_by=? WHERE id=? AND id_agencia=?',
        [nombre, correo, telefono, user.id, prev.id, idAgencia]);
      evento(prev.id, 'actualizacion', user.id, prev, actual);
    });
    res.json({ item: actual, coincidencias });
  });
  router.delete('/:agencia/asesores/:id', (req, res) => {
    const user = actor(req);
    const idAgencia = resolveAgencia(db, req.params.agencia, user);
    const contacto = findContacto(idAgencia, req.params.id);
    if (!contacto) throw new HttpError(404, 'Contacto no disponible');
    if (contacto.deleted_at !== null) { res.json(contacto); return; }
    const now = new Date().toISOString();
    const borrado: ContactoRow = { ...contacto, deleted_at: now, deleted_by: user.id, updated_by: user.id };
    db.transaction(() => {
      db.run('UPDATE contactos SET deleted_at=?, deleted_by=?, updated_by=? WHERE id=? AND id_agencia=?',
        [now, user.id, user.id, contacto.id, idAgencia]);
      evento(contacto.id, 'baja', user.id, contacto, borrado);
    });
    res.json(borrado);
  });
  router.patch('/:agencia/asesores/:id/restaurar', (req, res) => {
    const user = actor(req);
    const idAgencia = resolveAgencia(db, req.params.agencia, user);
    const contacto = findContacto(idAgencia, req.params.id);
    if (!contacto) throw new HttpError(404, 'Contacto no disponible');
    if (contacto.deleted_at === null) { res.json(contacto); return; }
    const restaurado: ContactoRow = { ...contacto, deleted_at: null, deleted_by: null, updated_by: user.id };
    db.transaction(() => {
      db.run('UPDATE contactos SET deleted_at=NULL, deleted_by=NULL, updated_by=? WHERE id=? AND id_agencia=?',
        [user.id, contacto.id, idAgencia]);
      evento(contacto.id, 'restauracion', user.id, contacto, restaurado);
    });
    res.json(restaurado);
  });
  router.get('/:agencia/asesores/:id/historial', (req, res) => {
    const user = actor(req);
    const idAgencia = resolveAgencia(db, req.params.agencia, user);
    const contacto = findContacto(idAgencia, req.params.id);
    if (!contacto) throw new HttpError(404, 'Contacto no disponible');
    const filas = db.all<EventoRow>('SELECT * FROM eventos WHERE contacto_id=? ORDER BY created_at DESC, id DESC', [contacto.id]);
    res.json(filas.map(f => ({
      id: f.id, contacto_id: f.contacto_id, accion: f.accion, actor_id: f.actor_id,
      anterior: f.anterior === null ? null : JSON.parse(f.anterior),
      nuevo: JSON.parse(f.nuevo), created_at: f.created_at,
    })));
  });
  return router;
}
