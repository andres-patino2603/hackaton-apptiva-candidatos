import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, HttpError } from '../http.js';

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface CrmRegistro {
  id: string;
  responsable_id: string | null;
  deleted_at: string | null;
}

interface Actividad {
  id: string;
  registro_id: string;
  tipo: string;
  resultado: string;
  detalle: string;
  fecha: string;
  actor_id: string;
}

interface Tarea {
  id: string;
  registro_id: string;
  titulo: string;
  vence_at: string;
  responsable_id: string;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

/** Genera un ID único de cadena */
function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Valida que un valor sea un timestamp UTC canónico: YYYY-MM-DDTHH:mm:ss.sssZ
 * Que la fecha sea real (no feb 31, etc.) y no futura si se indica.
 */
function parseTimestamp(value: unknown, fieldName: string, noFuture = false): string {
  if (typeof value !== 'string') throw new HttpError(400, `${fieldName} debe ser texto`);
  // Formato canónico estricto
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new HttpError(400, `${fieldName} formato inválido`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new HttpError(400, `${fieldName} fecha inválida`);
  // Verificar que la fecha sea real (new Date round-trips)
  if (parsed.toISOString() !== value) throw new HttpError(400, `${fieldName} fecha inválida`);
  if (noFuture && parsed > new Date()) throw new HttpError(400, `${fieldName} no puede ser futura`);
  return value;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function actividadesRouter(db: Db) {
  const router = Router();

  router.post('/registros/:id/actividades', (req, res) => {
    // ── 1. Autenticación ────────────────────────────────────────────────────
    const user = actor(req); // lanza 401 si ausente/desconocido

    // ── 2. Control de acceso por rol ────────────────────────────────────────
    if (!['admin', 'asesor'].includes(user.role)) {
      throw new HttpError(403, 'Sin acceso comercial');
    }

    // ── 3. Verificar registro activo ────────────────────────────────────────
    const registro = db.get<CrmRegistro>(
      'SELECT id, responsable_id, deleted_at FROM crm_registros WHERE id = ?',
      [req.params.id]
    );

    if (!registro || registro.deleted_at !== null) {
      throw new HttpError(404, 'Registro no encontrado');
    }

    // ── 4. Permisos por responsable ─────────────────────────────────────────
    // Admin puede gestionar cualquier registro activo.
    // Asesor solo si su ID es el responsable_id exacto.
    if (user.role === 'asesor' && registro.responsable_id !== user.id) {
      throw new HttpError(403, 'Registro ajeno o sin responsable asignado');
    }

    // ── 5. Validación del cuerpo ─────────────────────────────────────────────
    const body = req.body;

    // tipo
    if (body.tipo === null || body.tipo === undefined || typeof body.tipo !== 'string') {
      throw new HttpError(400, 'tipo requerido');
    }
    if (body.tipo.length > 80) throw new HttpError(400, 'tipo demasiado largo');
    const tipo = body.tipo.trim();
    if (!['llamada', 'correo', 'reunion'].includes(tipo)) {
      throw new HttpError(400, 'tipo inválido: debe ser llamada, correo o reunion');
    }

    // resultado
    if (body.resultado === null || body.resultado === undefined || typeof body.resultado !== 'string') {
      throw new HttpError(400, 'resultado requerido');
    }
    if (body.resultado.length > 80) throw new HttpError(400, 'resultado demasiado largo');
    const resultado = body.resultado.trim();
    if (!['contactado', 'sin_respuesta'].includes(resultado)) {
      throw new HttpError(400, 'resultado inválido: debe ser contactado o sin_respuesta');
    }

    // detalle
    if (body.detalle === null || body.detalle === undefined || typeof body.detalle !== 'string') {
      throw new HttpError(400, 'detalle requerido');
    }
    if (body.detalle.length > 5000) throw new HttpError(400, 'detalle demasiado largo');
    const detalle = body.detalle.trim();
    if (detalle === '') throw new HttpError(400, 'detalle no puede estar vacío');

    // fecha (opcional; null explícito → 400)
    let fecha: string;
    if (body.fecha === undefined) {
      fecha = new Date().toISOString();
    } else if (body.fecha === null) {
      throw new HttpError(400, 'fecha no puede ser null; omite el campo si quieres usar la fecha actual');
    } else {
      fecha = parseTimestamp(body.fecha, 'fecha', true); // no futura
    }

    // proxima_accion y vence_at: deben venir juntos o ninguno
    const tieneProximaAccion = body.proxima_accion !== undefined;
    const tieneVenceAt       = body.vence_at !== undefined;

    if (tieneProximaAccion !== tieneVenceAt) {
      throw new HttpError(400, 'proxima_accion y vence_at deben enviarse juntos');
    }

    // Rechazar null explícito en opcionales
    if (body.proxima_accion === null) throw new HttpError(400, 'proxima_accion no puede ser null');
    if (body.vence_at === null)       throw new HttpError(400, 'vence_at no puede ser null');

    let proximaAccion: string | null = null;
    let venceAt: string | null = null;

    if (tieneProximaAccion) {
      if (typeof body.proxima_accion !== 'string') throw new HttpError(400, 'proxima_accion debe ser texto');
      if (body.proxima_accion.length > 200)        throw new HttpError(400, 'proxima_accion demasiado largo');
      proximaAccion = body.proxima_accion.trim();
      if (proximaAccion === '')                     throw new HttpError(400, 'proxima_accion no puede estar vacío');

      venceAt = parseTimestamp(body.vence_at, 'vence_at', false); // puede ser pasado
    }

    // Campos prohibidos en el body (IDs de entidades)
    for (const forbidden of ['actor_id', 'responsable_id', 'registro_id']) {
      if (body[forbidden] !== undefined) throw new HttpError(400, `Campo no permitido: ${forbidden}`);
    }

    // ── 6. Persistencia atómica ─────────────────────────────────────────────
    const actividadId = newId();
    const ts          = new Date().toISOString();

    const { actividad, tarea } = db.transaction(() => {
      // 6a. Insertar actividad
      db.run(
        `INSERT INTO crm_actividades (id, registro_id, tipo, resultado, detalle, fecha, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [actividadId, registro.id, tipo, resultado, detalle, fecha, user.id]
      );

      // 6b. Evento de auditoría: actividad (secuencial por AUTOINCREMENT)
      db.run(
        `INSERT INTO crm_historial (registro_id, accion, actor_id, entidad_id, created_at)
         VALUES (?, 'actividad', ?, ?, ?)`,
        [registro.id, user.id, actividadId, ts]
      );

      // 6c. Tarea (si se solicitó próxima acción)
      let tarea: Tarea | null = null;

      if (proximaAccion !== null && venceAt !== null) {
        const tareaId       = newId();
        // Responsable: el del registro, o el actor si no tiene
        const responsableId = registro.responsable_id ?? user.id;

        db.run(
          `INSERT INTO crm_tareas (id, registro_id, titulo, vence_at, responsable_id)
           VALUES (?, ?, ?, ?, ?)`,
          [tareaId, registro.id, proximaAccion, venceAt, responsableId]
        );

        // 6d. Evento de auditoría: tarea_creada (después del evento de actividad)
        db.run(
          `INSERT INTO crm_historial (registro_id, accion, actor_id, entidad_id, created_at)
           VALUES (?, 'tarea_creada', ?, ?, ?)`,
          [registro.id, user.id, tareaId, ts]
        );

        tarea = {
          id:             tareaId,
          registro_id:    registro.id,
          titulo:         proximaAccion,
          vence_at:       venceAt,
          responsable_id: responsableId,
        };
      }

      const actividad: Actividad = {
        id:          actividadId,
        registro_id: registro.id,
        tipo,
        resultado,
        detalle,
        fecha,
        actor_id:    user.id,
      };

      return { actividad, tarea };
    });

    // ── 7. Respuesta 201 ────────────────────────────────────────────────────
    res.status(201).json({ actividad, tarea });
  });

  return router;
}
