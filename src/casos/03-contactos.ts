import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, scalar, integer, HttpError } from '../http.js';

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface Agencia {
  id: number;
  advisor_id: string | null;
  deleted_at: string | null;
}

interface Contacto {
  id: string;
  id_agencia: number;
  nombre_completo: string;
  correo: string | null;
  telefono: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_by: string;
  updated_by: string;
}

interface Evento {
  id: number;
  contacto_id: string;
  accion: string;
  actor_id: string;
  anterior: string | null;
  nuevo: string;
  created_at: string;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

/** Genera un ID único de cadena */
function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Timestamp ISO 8601 UTC */
function now(): string {
  return new Date().toISOString();
}

/**
 * Normaliza correo: trim, lowercase; valida formato básico.
 * Devuelve null si viene vacío/ausente; lanza 400 si formato inválido.
 */
function normalizeCorreo(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Correo inválido');
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return null;
  if (trimmed.length > 255) throw new HttpError(400, 'Correo demasiado largo');
  // forma básica: local@dominio.sufijo — sin espacios, con @ y punto después del @
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) throw new HttpError(400, 'Correo inválido');
  return trimmed;
}

/**
 * Normaliza teléfono: quita todo salvo dígitos y +; el + solo al inicio.
 * Devuelve null si queda vacío; lanza 400 si supera 30 chars.
 */
function normalizeTelefono(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Teléfono inválido');
  if (value.length > 30) throw new HttpError(400, 'Teléfono demasiado largo');
  // quitar todo salvo dígitos y +
  let cleaned = value.replace(/[^\d+]/g, '');
  // remover + que no esté al inicio
  cleaned = cleaned.replace(/(?!^)\+/g, '');
  if (cleaned === '' || cleaned === '+') return null;
  if (cleaned.length > 30) throw new HttpError(400, 'Teléfono demasiado largo');
  return cleaned;
}

/**
 * Valida y devuelve nombre_completo.
 * Obligatorio, máximo 150 chars antes de trim, no vacío tras trim.
 */
function normalizeNombre(value: unknown): string {
  if (value === undefined || value === null || typeof value !== 'string')
    throw new HttpError(400, 'nombre_completo requerido');
  if (value.length > 150) throw new HttpError(400, 'nombre_completo demasiado largo');
  const trimmed = value.trim();
  if (trimmed === '') throw new HttpError(400, 'nombre_completo no puede estar vacío');
  return trimmed;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function contactosRouter(db: Db) {
  // Router raíz que captura /:agencia/asesores y delega al subrouter
  const root = Router();
  const router = Router({ mergeParams: true });
  root.use('/:agencia/asesores', router);

  // ── Middleware: valida agencia y permisos ──────────────────────────────────
  router.use((req, _res, next) => {
    const user = actor(req);

    // ID de agencia: entero positivo hasta 1000000
    const agenciaId = integer(req.params.agencia, 0, 1, 1000000);

    const agencia = db.get<Agencia>(
      'SELECT id, advisor_id, deleted_at FROM agencias WHERE id = ?',
      [agenciaId]
    );

    // Agencia inexistente o eliminada → 404
    if (!agencia || agencia.deleted_at !== null) throw new HttpError(404, 'Agencia no encontrada');

    // Permisos: admin pasa siempre; asesor solo si es propietario; analista → 403
    if (user.role === 'analista') throw new HttpError(403, 'Sin acceso');
    if (user.role === 'asesor' && agencia.advisor_id !== user.id) throw new HttpError(403, 'Sin acceso a esta agencia');

    // Adjuntamos al request para uso en rutas
    (req as any)._agenciaId = agencia.id;
    (req as any)._actor = user;
    next();
  });

  // ── GET / — Listado paginado ───────────────────────────────────────────────
  router.get('/', (req, res) => {
    const agenciaId: number = (req as any)._agenciaId;

    const page   = integer(req.query.page,  1,  1, 1000000);
    const limit  = integer(req.query.limit, 20, 1, 100);
    const vista  = scalar(req.query.vista, 'activos');
    const search = req.query.search !== undefined ? scalar(req.query.search) : null;

    if (!['activos', 'eliminados'].includes(vista)) throw new HttpError(400, 'vista inválida');
    if (search !== null && search.length > 150) throw new HttpError(400, 'search demasiado largo');

    const eliminadosFiltro = vista === 'eliminados'
      ? 'c.deleted_at IS NOT NULL'
      : 'c.deleted_at IS NULL';

    // search: subcadena en nombre o correo (case-insensitive ASCII) o teléfono
    const searchParam = search ? `%${search}%` : null;
    const searchFiltro = searchParam
      ? `AND (LOWER(c.nombre_completo) LIKE LOWER(?) OR LOWER(COALESCE(c.correo,'')) LIKE LOWER(?) OR COALESCE(c.telefono,'') LIKE ?)`
      : '';

    const baseParams: (string | number | null)[] = [agenciaId];
    const searchParams: (string | null)[] = searchParam ? [searchParam, searchParam, searchParam] : [];

    const total = db.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM contactos c
       WHERE c.id_agencia = ? AND ${eliminadosFiltro} ${searchFiltro}`,
      [...baseParams, ...searchParams]
    ).total;

    const items = db.all<Contacto>(
      `SELECT * FROM contactos c
       WHERE c.id_agencia = ? AND ${eliminadosFiltro} ${searchFiltro}
       ORDER BY LOWER(c.nombre_completo) ASC, c.id ASC
       LIMIT ? OFFSET ?`,
      [...baseParams, ...searchParams, limit, (page - 1) * limit]
    );

    res.json({ items, total, page, limit });
  });

  // ── POST / — Creación ──────────────────────────────────────────────────────
  router.post('/', (req, res) => {
    const agenciaId: number = (req as any)._agenciaId;
    const user = (req as any)._actor;
    const body = req.body;

    const nombre   = normalizeNombre(body.nombre_completo);
    const correo   = normalizeCorreo(body.correo);
    const telefono = normalizeTelefono(body.telefono);
    const id       = newId();
    const ts       = now();

    const { item, coincidencias } = db.transaction(() => {
      db.run(
        `INSERT INTO contactos (id, id_agencia, nombre_completo, correo, telefono, deleted_at, deleted_by, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        [id, agenciaId, nombre, correo, telefono, user.id, user.id]
      );

      const item = db.get<Contacto>('SELECT * FROM contactos WHERE id = ?', [id])!;

      // Evento de auditoría
      db.run(
        `INSERT INTO eventos (contacto_id, accion, actor_id, anterior, nuevo, created_at)
         VALUES (?, 'creacion', ?, NULL, ?, ?)`,
        [id, user.id, JSON.stringify(item), ts]
      );

      const coincidencias = buscarCoincidencias(db, agenciaId, correo, telefono, id);
      return { item, coincidencias };
    });

    res.status(201).json({ item, coincidencias });
  });

  // ── PATCH /:id — Edición ───────────────────────────────────────────────────
  router.patch('/:id', (req, res) => {
    // Evitar que coincida con /:id/restaurar
    if (req.params.id === 'restaurar') return res.status(404).json({ error: 'No encontrado' });

    const agenciaId: number = (req as any)._agenciaId;
    const user = (req as any)._actor;
    const body = req.body;

    const contacto = getContacto(db, req.params.id, agenciaId);
    if (contacto.deleted_at !== null) throw new HttpError(404, 'Contacto eliminado');

    const nombre   = normalizeNombre(body.nombre_completo);
    const correo   = normalizeCorreo(body.correo);
    const telefono = normalizeTelefono(body.telefono);
    const ts       = now();

    const { item, coincidencias } = db.transaction(() => {
      const anterior = { ...contacto };

      db.run(
        `UPDATE contactos SET nombre_completo = ?, correo = ?, telefono = ?, updated_by = ? WHERE id = ?`,
        [nombre, correo, telefono, user.id, contacto.id]
      );

      const item = db.get<Contacto>('SELECT * FROM contactos WHERE id = ?', [contacto.id])!;

      db.run(
        `INSERT INTO eventos (contacto_id, accion, actor_id, anterior, nuevo, created_at)
         VALUES (?, 'actualizacion', ?, ?, ?, ?)`,
        [contacto.id, user.id, JSON.stringify(anterior), JSON.stringify(item), ts]
      );

      const coincidencias = buscarCoincidencias(db, agenciaId, correo, telefono, contacto.id);
      return { item, coincidencias };
    });

    res.json({ item, coincidencias });
  });

  // ── DELETE /:id — Baja lógica ──────────────────────────────────────────────
  router.delete('/:id', (req, res) => {
    const agenciaId: number = (req as any)._agenciaId;
    const user = (req as any)._actor;

    const contacto = getContacto(db, req.params.id, agenciaId);
    const ts = now();

    // Idempotente: si ya está eliminado no duplica eventos
    if (contacto.deleted_at !== null) {
      return res.json(contacto);
    }

    const item = db.transaction(() => {
      const anterior = { ...contacto };

      db.run(
        `UPDATE contactos SET deleted_at = ?, deleted_by = ?, updated_by = ? WHERE id = ?`,
        [ts, user.id, user.id, contacto.id]
      );

      const item = db.get<Contacto>('SELECT * FROM contactos WHERE id = ?', [contacto.id])!;

      db.run(
        `INSERT INTO eventos (contacto_id, accion, actor_id, anterior, nuevo, created_at)
         VALUES (?, 'baja', ?, ?, ?, ?)`,
        [contacto.id, user.id, JSON.stringify(anterior), JSON.stringify(item), ts]
      );

      return item;
    });

    res.json(item);
  });

  // ── PATCH /:id/restaurar — Restauración ───────────────────────────────────
  router.patch('/:id/restaurar', (req, res) => {
    const agenciaId: number = (req as any)._agenciaId;
    const user = (req as any)._actor;

    const contacto = getContacto(db, req.params.id, agenciaId);
    const ts = now();

    // Idempotente: si ya está activo no duplica eventos
    if (contacto.deleted_at === null) {
      return res.json(contacto);
    }

    const item = db.transaction(() => {
      const anterior = { ...contacto };

      db.run(
        `UPDATE contactos SET deleted_at = NULL, deleted_by = NULL, updated_by = ? WHERE id = ?`,
        [user.id, contacto.id]
      );

      const item = db.get<Contacto>('SELECT * FROM contactos WHERE id = ?', [contacto.id])!;

      db.run(
        `INSERT INTO eventos (contacto_id, accion, actor_id, anterior, nuevo, created_at)
         VALUES (?, 'restauracion', ?, ?, ?, ?)`,
        [contacto.id, user.id, JSON.stringify(anterior), JSON.stringify(item), ts]
      );

      return item;
    });

    res.json(item);
  });

  // ── GET /:id/historial — Historial de auditoría ────────────────────────────
  router.get('/:id/historial', (req, res) => {
    const agenciaId: number = (req as any)._agenciaId;

    // Verificar que el contacto pertenece a la agencia (incluidos eliminados)
    getContacto(db, req.params.id, agenciaId);

    const eventos = db.all<Evento>(
      `SELECT * FROM eventos WHERE contacto_id = ? ORDER BY created_at DESC, id DESC`,
      [req.params.id]
    );

    // Deserializar anterior/nuevo a objetos JSON para la respuesta
    const result = eventos.map(e => ({
      ...e,
      anterior: e.anterior ? JSON.parse(e.anterior as string) : null,
      nuevo: JSON.parse(e.nuevo as string),
    }));

    res.json(result);
  });

  return root;
}

// ─── Helpers privados ─────────────────────────────────────────────────────────

/** Obtiene un contacto validando que pertenece a la agencia; lanza 404 si no. */
function getContacto(db: Db, id: string, agenciaId: number): Contacto {
  const contacto = db.get<Contacto>(
    'SELECT * FROM contactos WHERE id = ? AND id_agencia = ?',
    [id, agenciaId]
  );
  if (!contacto) throw new HttpError(404, 'Contacto no encontrado');
  return contacto;
}

/**
 * Busca coincidencias de correo o teléfono en contactos activos de la misma agencia,
 * excluyendo el propio contacto (para edición). Null no coincide.
 */
function buscarCoincidencias(
  db: Db,
  agenciaId: number,
  correo: string | null,
  telefono: string | null,
  excludeId: string
): { id: string; nombre_completo: string }[] {
  if (!correo && !telefono) return [];

  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  if (correo) {
    conditions.push('correo = ?');
    params.push(correo);
  }
  if (telefono) {
    conditions.push('telefono = ?');
    params.push(telefono);
  }

  const rows = db.all<{ id: string; nombre_completo: string }>(
    `SELECT id, nombre_completo FROM contactos
     WHERE id_agencia = ?
       AND deleted_at IS NULL
       AND id != ?
       AND (${conditions.join(' OR ')})`,
    [agenciaId, excludeId, ...params]
  );

  // Deduplicar por id (puede coincidir por ambos campos)
  const seen = new Set<string>();
  return rows.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}
