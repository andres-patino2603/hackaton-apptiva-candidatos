// Caso 3: directorio de contactos por agencia.
// Guia rapida:
// - cargarAgencia(): valida ID 1..1000000, rol, existencia/no eliminacion y propiedad.
// - normalizarContacto(): valida objeto plano y normaliza nombre, correo y telefono.
// - GET '/:agencia/asesores': lista activos o eliminados, con filtros antes de paginar.
// - POST: crea contacto y evento 'creacion' en una transaccion.
// - PATCH '/:id': reemplaza los campos, actualiza updated_by y registra 'actualizacion'.
// - DELETE '/:id': baja logica idempotente con evento 'baja' solo si cambia estado.
// - PATCH '/:id/restaurar': restaura conservando ID y registra 'restauracion'.
// - GET '/:id/historial': devuelve eventos ordenados por fecha e ID, con JSON parseado.
// - buscarCoincidencias(): otros contactos activos de la misma agencia con mismo correo o telefono.
import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, HttpError, scalar, integer } from '../http.js';

type Contacto = {
  id: string;
  id_agencia: number;
  nombre_completo: string;
  correo: string | null;
  telefono: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_by: string;
  updated_by: string;
};

type Agencia = {
  id: number;
  advisor_id: string | null;
  deleted_at: string | null;
};

type EventoFila = {
  id: number;
  contacto_id: string;
  accion: string;
  actor_id: string;
  anterior: string | null;
  nuevo: string;
  created_at: string;
};

function esObjetoPlano(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Valida un body plano y normaliza nombre, correo y telefono.
// Se comparte entre POST y PATCH para aplicar las mismas reglas.
function normalizarContacto(body: unknown): { nombre_completo: string; correo: string | null; telefono: string | null } {
  if (!esObjetoPlano(body)) throw new HttpError(400, 'Cuerpo inválido');

  const rawNombre = body.nombre_completo;
  if (typeof rawNombre !== 'string') throw new HttpError(400, 'nombre_completo es obligatorio');
  if (rawNombre.length > 150) throw new HttpError(400, 'nombre_completo demasiado largo');
  const nombre = rawNombre.trim();
  if (nombre === '') throw new HttpError(400, 'nombre_completo no puede estar vacío');

  let correo: string | null = null;
  if (body.correo !== undefined && body.correo !== null) {
    if (typeof body.correo !== 'string') throw new HttpError(400, 'correo inválido');
    if (body.correo.length > 255) throw new HttpError(400, 'correo demasiado largo');
    const normalizado = body.correo.trim().toLowerCase();
    if (normalizado !== '') {
      if (/\s/.test(normalizado)) throw new HttpError(400, 'correo no puede contener espacios');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) throw new HttpError(400, 'formato de correo inválido');
      correo = normalizado;
    }
  }

  let telefono: string | null = null;
  if (body.telefono !== undefined && body.telefono !== null) {
    if (typeof body.telefono !== 'string') throw new HttpError(400, 'teléfono inválido');
    if (body.telefono.length > 30) throw new HttpError(400, 'teléfono demasiado largo');
    const limpio = body.telefono.replace(/[^0-9+]/g, '');
    let resultado = '';
    let masInicialUsado = false;
    for (const ch of limpio) {
      if (ch === '+') {
        if (!masInicialUsado && resultado === '') {
          resultado += ch;
          masInicialUsado = true;
        }
      } else {
        resultado += ch;
      }
    }
    if (resultado !== '') telefono = resultado;
  }

  return { nombre_completo: nombre, correo, telefono };
}

// Valida ID, permisos, existencia y baja logica de la agencia.
// Se llama en todas las rutas del directorio.
function cargarAgencia(db: Db, param: unknown, user: ReturnType<typeof actor>) {
  const texto = scalar(param);
  if (!/^\d+$/.test(texto)) throw new HttpError(400, 'ID de agencia inválido');
  const id = Number(texto);
  if (!Number.isSafeInteger(id) || id < 1 || id > 1000000) throw new HttpError(400, 'ID de agencia fuera de rango');

  if (!['admin', 'asesor'].includes(user.role)) throw new HttpError(403, 'Sin permiso para esta agencia');

  const agencia = db.get<Agencia>('SELECT id, advisor_id, deleted_at FROM agencias WHERE id = ?', [id]);
  if (!agencia || agencia.deleted_at) throw new HttpError(404, 'Agencia no disponible');

  if (user.role === 'asesor' && agencia.advisor_id !== user.id) throw new HttpError(403, 'Agencia ajena');

  return { id, agencia };
}

// Busca otros contactos activos de la misma agencia con mismo correo o telefono.
// Null no coincide y se excluye el propio ID.
function buscarCoincidencias(db: Db, idAgencia: number, correo: string | null, telefono: string | null, excluirId: string) {
  return db.all<{ id: string; nombre_completo: string }>(
    `SELECT id, nombre_completo
     FROM contactos
     WHERE id_agencia = ? AND deleted_at IS NULL AND id <> ?
       AND ((? IS NOT NULL AND correo = ?) OR (? IS NOT NULL AND telefono = ?))`,
    [idAgencia, excluirId, correo, correo, telefono, telefono]
  );
}

function contactoCompleto(row: Contacto): Contacto {
  return row;
}

export function contactosRouter(db: Db) {
  const router = Router();

  router.get('/:agencia/asesores', (req, res) => {
    const user = actor(req);
    const { id: idAgencia } = cargarAgencia(db, req.params.agencia, user);

    const page = integer(req.query.page, 1, 1, 1000000);
    const limit = integer(req.query.limit, 20, 1, 100);
    const vista = scalar(req.query.vista, 'activos');
    if (vista !== 'activos' && vista !== 'eliminados') throw new HttpError(400, 'Vista inválida');

    const searchProvided = req.query.search !== undefined;
    const search = searchProvided ? scalar(req.query.search) : null;
    if (search !== null && search.length > 150) throw new HttpError(400, 'Búsqueda demasiado larga');

    const deletedFilter = vista === 'activos' ? 'deleted_at IS NULL' : 'deleted_at IS NOT NULL';
    const params: any[] = [idAgencia];
    let where = `WHERE id_agencia = ? AND ${deletedFilter}`;

    if (search !== null) {
      where += ` AND (instr(lower(nombre_completo), lower(?)) > 0
        OR instr(lower(COALESCE(correo, '')), lower(?)) > 0
        OR instr(lower(COALESCE(telefono, '')), lower(?)) > 0)`;
      params.push(search, search, search);
    }

    const total = db.get<{ total: number }>(`SELECT COUNT(*) AS total FROM contactos ${where}`, params).total;
    const items = db.all<Contacto>(
      `SELECT * FROM contactos ${where} ORDER BY nombre_completo COLLATE NOCASE, id LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );

    res.json({ items, total, page, limit });
  });

  router.post('/:agencia/asesores', (req, res) => {
    const user = actor(req);
    const { id: idAgencia } = cargarAgencia(db, req.params.agencia, user);
    const datos = normalizarContacto(req.body);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const nuevoContacto = {
      id,
      id_agencia: idAgencia,
      nombre_completo: datos.nombre_completo,
      correo: datos.correo,
      telefono: datos.telefono,
      deleted_at: null,
      deleted_by: null,
      created_by: user.id,
      updated_by: user.id
    };

    db.transaction(() => {
      db.run(
        `INSERT INTO contactos (id, id_agencia, nombre_completo, correo, telefono, deleted_at, deleted_by, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        [id, idAgencia, datos.nombre_completo, datos.correo, datos.telefono, user.id, user.id]
      );
      db.run(
        `INSERT INTO eventos (contacto_id, accion, actor_id, anterior, nuevo, created_at)
         VALUES (?, 'creacion', ?, NULL, ?, ?)`,
        [id, user.id, JSON.stringify(nuevoContacto), now]
      );
    });

    const item = db.get<Contacto>('SELECT * FROM contactos WHERE id = ?', [id])!;
    const coincidencias = buscarCoincidencias(db, idAgencia, datos.correo, datos.telefono, id);
    res.status(201).json({ item: contactoCompleto(item), coincidencias });
  });

  router.patch('/:agencia/asesores/:id', (req, res) => {
    const user = actor(req);
    const { id: idAgencia } = cargarAgencia(db, req.params.agencia, user);

    const existente = db.get<Contacto>('SELECT * FROM contactos WHERE id = ? AND id_agencia = ?', [req.params.id, idAgencia]);
    if (!existente || existente.deleted_at) throw new HttpError(404, 'Contacto no disponible');

    const datos = normalizarContacto(req.body);
    const now = new Date().toISOString();
    const anterior = { ...existente };
    const nuevo = {
      ...existente,
      nombre_completo: datos.nombre_completo,
      correo: datos.correo,
      telefono: datos.telefono,
      updated_by: user.id
    };

    db.transaction(() => {
      db.run(
        `UPDATE contactos SET nombre_completo = ?, correo = ?, telefono = ?, updated_by = ? WHERE id = ?`,
        [datos.nombre_completo, datos.correo, datos.telefono, user.id, req.params.id]
      );
      db.run(
        `INSERT INTO eventos (contacto_id, accion, actor_id, anterior, nuevo, created_at)
         VALUES (?, 'actualizacion', ?, ?, ?, ?)`,
        [req.params.id, user.id, JSON.stringify(anterior), JSON.stringify(nuevo), now]
      );
    });

    const item = db.get<Contacto>('SELECT * FROM contactos WHERE id = ?', [req.params.id])!;
    const coincidencias = buscarCoincidencias(db, idAgencia, datos.correo, datos.telefono, req.params.id);
    res.json({ item: contactoCompleto(item), coincidencias });
  });

  router.delete('/:agencia/asesores/:id', (req, res) => {
    const user = actor(req);
    const { id: idAgencia } = cargarAgencia(db, req.params.agencia, user);

    const existente = db.get<Contacto>('SELECT * FROM contactos WHERE id = ? AND id_agencia = ?', [req.params.id, idAgencia]);
    if (!existente) throw new HttpError(404, 'Contacto no disponible');

    if (existente.deleted_at === null) {
      const now = new Date().toISOString();
      const anterior = { ...existente };
      const nuevo = {
        ...existente,
        deleted_at: now,
        deleted_by: user.id,
        updated_by: user.id
      };

      db.transaction(() => {
        db.run(
          `UPDATE contactos SET deleted_at = ?, deleted_by = ?, updated_by = ? WHERE id = ?`,
          [now, user.id, user.id, req.params.id]
        );
        db.run(
          `INSERT INTO eventos (contacto_id, accion, actor_id, anterior, nuevo, created_at)
           VALUES (?, 'baja', ?, ?, ?, ?)`,
          [req.params.id, user.id, JSON.stringify(anterior), JSON.stringify(nuevo), now]
        );
      });
    }

    const item = db.get<Contacto>('SELECT * FROM contactos WHERE id = ? AND id_agencia = ?', [req.params.id, idAgencia])!;
    res.json(contactoCompleto(item));
  });

  router.patch('/:agencia/asesores/:id/restaurar', (req, res) => {
    const user = actor(req);
    const { id: idAgencia } = cargarAgencia(db, req.params.agencia, user);

    const existente = db.get<Contacto>('SELECT * FROM contactos WHERE id = ? AND id_agencia = ?', [req.params.id, idAgencia]);
    if (!existente) throw new HttpError(404, 'Contacto no disponible');

    if (existente.deleted_at !== null) {
      const now = new Date().toISOString();
      const anterior = { ...existente };
      const nuevo = {
        ...existente,
        deleted_at: null,
        deleted_by: null,
        updated_by: user.id
      };

      db.transaction(() => {
        db.run(
          `UPDATE contactos SET deleted_at = NULL, deleted_by = NULL, updated_by = ? WHERE id = ?`,
          [user.id, req.params.id]
        );
        db.run(
          `INSERT INTO eventos (contacto_id, accion, actor_id, anterior, nuevo, created_at)
           VALUES (?, 'restauracion', ?, ?, ?, ?)`,
          [req.params.id, user.id, JSON.stringify(anterior), JSON.stringify(nuevo), now]
        );
      });
    }

    const item = db.get<Contacto>('SELECT * FROM contactos WHERE id = ? AND id_agencia = ?', [req.params.id, idAgencia])!;
    res.json(contactoCompleto(item));
  });

  router.get('/:agencia/asesores/:id/historial', (req, res) => {
    const user = actor(req);
    const { id: idAgencia } = cargarAgencia(db, req.params.agencia, user);

    const contacto = db.get<Contacto>('SELECT * FROM contactos WHERE id = ? AND id_agencia = ?', [req.params.id, idAgencia]);
    if (!contacto) throw new HttpError(404, 'Contacto no disponible');

    const filas = db.all<EventoFila>(
      `SELECT * FROM eventos WHERE contacto_id = ? ORDER BY created_at DESC, id DESC`,
      [req.params.id]
    );

    const eventos = filas.map((fila) => ({
      id: fila.id,
      contacto_id: fila.contacto_id,
      accion: fila.accion,
      actor_id: fila.actor_id,
      anterior: fila.anterior === null ? null : JSON.parse(fila.anterior),
      nuevo: JSON.parse(fila.nuevo),
      created_at: fila.created_at
    }));

    res.json(eventos);
  });

  return router;
}
