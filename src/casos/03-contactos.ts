import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { actor, HttpError, type Actor, integer } from '../http.js';

type Contacto = {
  id: string; id_agencia: number; nombre_completo: string; correo: string | null; telefono: string | null;
  deleted_at: string | null; deleted_by: string | null; created_by: string; updated_by: string;
};

function agenciaPermitida(db: Db, user: Actor, texto: string): number {
  if (user.role !== 'admin' && user.role !== 'asesor') throw new HttpError(403, 'Sin acceso al directorio');
  if (!/^\d+$/.test(texto)) throw new HttpError(400, 'Agencia invalida');
  const id = Number(texto);
  if (id < 1 || id > 1000000) throw new HttpError(400, 'Agencia invalida');
  const agencia = db.get<{ advisor_id: string | null }>('SELECT advisor_id FROM agencias WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!agencia) throw new HttpError(404, 'Agencia no encontrada');
  if (user.role === 'asesor' && agencia.advisor_id !== user.id) throw new HttpError(403, 'Agencia ajena');
  return id;
}

function textoOpcional(valor: unknown, max: number, campo: string): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string' || valor.length > max) throw new HttpError(400, `${campo} invalido`);
  return valor;
}

function leerCuerpo(body: unknown) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Cuerpo invalido');
  const b = body as Record<string, unknown>;
  if (typeof b.nombre_completo !== 'string' || b.nombre_completo.length > 150) throw new HttpError(400, 'Nombre invalido');
  const nombre = b.nombre_completo.trim();
  if (!nombre) throw new HttpError(400, 'Nombre requerido');
  let correo = textoOpcional(b.correo, 255, 'Correo');
  if (correo !== null) {
    correo = correo.trim().toLowerCase();
    if (correo === '') correo = null;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new HttpError(400, 'Correo invalido');
  }
  let telefono = textoOpcional(b.telefono, 30, 'Telefono');
  if (telefono !== null) {
    telefono = telefono.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    if (telefono === '') telefono = null;
  }
  return { nombre, correo, telefono };
}

function coincidencias(db: Db, agencia: number, excluirId: string, correo: string | null, telefono: string | null) {
  return db.all<{ id: string; nombre_completo: string }>(
    `SELECT id, nombre_completo FROM contactos
     WHERE id_agencia = ? AND deleted_at IS NULL AND id <> ?
       AND ((? IS NOT NULL AND correo = ?) OR (? IS NOT NULL AND telefono = ?))`,
    [agencia, excluirId, correo, correo, telefono, telefono]);
}

function registrarEvento(db: Db, contactoId: string, accion: string, actorId: string, anterior: Contacto | null, nuevo: Contacto) {
  db.run(
    'INSERT INTO eventos (contacto_id, accion, actor_id, anterior, nuevo, created_at) VALUES (?,?,?,?,?,?)',
    [contactoId, accion, actorId, anterior ? JSON.stringify(anterior) : null, JSON.stringify(nuevo), new Date().toISOString()]);
}

const buscar = (db: Db, id: string) => db.get<Contacto>('SELECT * FROM contactos WHERE id = ?', [id])!;

export function contactosRouter(db: Db) {
  const router = Router();

  router.get('/:agencia/asesores', (req, res) => {
    const user = actor(req);
    const agencia = agenciaPermitida(db, user, req.params.agencia);
    const vistaRaw = req.query.vista === undefined ? 'activos' : req.query.vista;
    const vista = typeof vistaRaw === 'string' ? vistaRaw : '';
    if (vista !== 'activos' && vista !== 'eliminados') throw new HttpError(400, 'Vista invalida');
    const page = integer(req.query.page, 1, 1, 1000000);
    const limit = integer(req.query.limit, 20, 1, 100);
    const searchRaw = req.query.search === undefined ? null : req.query.search;
    if (searchRaw !== null && typeof searchRaw !== 'string') throw new HttpError(400, 'Busqueda invalida');
    const search = searchRaw as string | null;
    if (search !== null && search.length > 150) throw new HttpError(400, 'Busqueda demasiado larga');

    const where = vista === 'eliminados'
      ? 'id_agencia = ? AND deleted_at IS NOT NULL'
      : 'id_agencia = ? AND deleted_at IS NULL';
    const base: any[] = [agencia];
    let filtro = '';
    const filtroParams: any[] = [];
    if (search !== null) {
      filtro = ` AND (instr(lower(nombre_completo), lower(?)) > 0
                    OR instr(lower(coalesce(correo, '')), lower(?)) > 0
                    OR instr(coalesce(telefono, ''), ?) > 0)`;
      filtroParams.push(search, search, search);
    }
    const total = db.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM contactos WHERE ${where}${filtro}`,
      [...base, ...filtroParams]).total;
    const items = db.all<Contacto>(
      `SELECT * FROM contactos WHERE ${where}${filtro} ORDER BY nombre_completo COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?`,
      [...base, ...filtroParams, limit, (page - 1) * limit]);
    res.json({ items, total, page, limit });
  });

  router.post('/:agencia/asesores', (req, res) => {
    const user = actor(req);
    const agencia = agenciaPermitida(db, user, req.params.agencia);
    const { nombre, correo, telefono } = leerCuerpo(req.body);
    const resultado = db.transaction(() => {
      const id = randomUUID();
      db.run('INSERT INTO contactos (id, id_agencia, nombre_completo, correo, telefono, created_by, updated_by) VALUES (?,?,?,?,?,?,?)',
        [id, agencia, nombre, correo, telefono, user.id, user.id]);
      const item = buscar(db, id);
      registrarEvento(db, id, 'creacion', user.id, null, item);
      return { item, coincidencias: coincidencias(db, agencia, id, correo, telefono) };
    });
    res.status(201).json(resultado);
  });

  router.patch('/:agencia/asesores/:id', (req, res) => {
    const user = actor(req);
    const agencia = agenciaPermitida(db, user, req.params.agencia);
    const id = req.params.id;
    const contacto = db.get<Contacto>('SELECT * FROM contactos WHERE id = ? AND id_agencia = ?', [id, agencia]);
    if (!contacto || contacto.deleted_at) throw new HttpError(404, 'Contacto no encontrado');
    const { nombre, correo, telefono } = leerCuerpo(req.body);
    const anterior = contacto;
    const resultado = db.transaction(() => {
      db.run('UPDATE contactos SET nombre_completo = ?, correo = ?, telefono = ?, updated_by = ? WHERE id = ?',
        [nombre, correo, telefono, user.id, id]);
      const item = buscar(db, id);
      registrarEvento(db, id, 'actualizacion', user.id, anterior, item);
      return { item, coincidencias: coincidencias(db, agencia, id, correo, telefono) };
    });
    res.json(resultado);
  });

  router.delete('/:agencia/asesores/:id', (req, res) => {
    const user = actor(req);
    const agencia = agenciaPermitida(db, user, req.params.agencia);
    const id = req.params.id;
    const contacto = db.get<Contacto>('SELECT * FROM contactos WHERE id = ? AND id_agencia = ?', [id, agencia]);
    if (!contacto) throw new HttpError(404, 'Contacto no encontrado');
    if (contacto.deleted_at) {
      res.json(contacto);
      return;
    }
    const ahora = new Date().toISOString();
    db.transaction(() => {
      db.run('UPDATE contactos SET deleted_at = ?, deleted_by = ?, updated_by = ? WHERE id = ?',
        [ahora, user.id, user.id, id]);
      const nuevo = buscar(db, id);
      registrarEvento(db, id, 'baja', user.id, contacto, nuevo);
    });
    res.json(buscar(db, id));
  });

  router.patch('/:agencia/asesores/:id/restaurar', (req, res) => {
    const user = actor(req);
    const agencia = agenciaPermitida(db, user, req.params.agencia);
    const id = req.params.id;
    const contacto = db.get<Contacto>('SELECT * FROM contactos WHERE id = ? AND id_agencia = ?', [id, agencia]);
    if (!contacto) throw new HttpError(404, 'Contacto no encontrado');
    if (!contacto.deleted_at) {
      res.json(contacto);
      return;
    }
    db.transaction(() => {
      const anterior = contacto;
      db.run('UPDATE contactos SET deleted_at = NULL, deleted_by = NULL, updated_by = ? WHERE id = ?', [user.id, id]);
      const nuevo = buscar(db, id);
      registrarEvento(db, id, 'restauracion', user.id, anterior, nuevo);
    });
    res.json(buscar(db, id));
  });

  router.get('/:agencia/asesores/:id/historial', (req, res) => {
    const user = actor(req);
    const agencia = agenciaPermitida(db, user, req.params.agencia);
    const id = req.params.id;
    const contacto = db.get<Contacto>('SELECT * FROM contactos WHERE id = ? AND id_agencia = ?', [id, agencia]);
    if (!contacto) throw new HttpError(404, 'Contacto no encontrado');
    const eventos = db.all<{ id: number; contacto_id: string; accion: string; actor_id: string; anterior: string | null; nuevo: string; created_at: string }>(
      'SELECT id, contacto_id, accion, actor_id, anterior, nuevo, created_at FROM eventos WHERE contacto_id = ? ORDER BY created_at DESC, id DESC',
      [id]);
    res.json(eventos.map(e => ({
      id: e.id,
      contacto_id: e.contacto_id,
      accion: e.accion,
      actor_id: e.actor_id,
      anterior: e.anterior ? JSON.parse(e.anterior) : null,
      nuevo: JSON.parse(e.nuevo),
      created_at: e.created_at,
    })));
  });

  return router;
}