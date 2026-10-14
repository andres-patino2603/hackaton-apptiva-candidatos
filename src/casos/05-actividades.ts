// Caso 5: actividad comercial y proxima accion.
// Valida body completo antes de una transaccion atomica.
import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, HttpError } from '../http.js';

const TIPOS_ACTIVIDAD = new Set(['llamada', 'correo', 'reunion']);
const RESULTADOS_ACTIVIDAD = new Set(['contactado', 'sin_respuesta']);

function esObjetoPlano(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Valida el formato UTC canonico y el round-trip con toISOString.
function validarFechaCanonical(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new HttpError(400, 'Fecha inválida');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) throw new HttpError(400, 'Fecha inválida');
  return value;
}

// Valida todo el body antes de la transaccion.
// Distingue campos ausentes de null y rechaza datos invalidos.
function validarCuerpo(body: unknown): {
  tipo: string;
  resultado: string;
  detalle: string;
  fecha: string | null;
  proxima_accion?: string;
  vence_at?: string;
} {
  if (!esObjetoPlano(body)) throw new HttpError(400, 'Cuerpo inválido');

  if (typeof body.tipo !== 'string') throw new HttpError(400, 'tipo es obligatorio');
  if (body.tipo.length > 80) throw new HttpError(400, 'tipo demasiado largo');
  const tipo = body.tipo.trim().toLowerCase();
  if (!TIPOS_ACTIVIDAD.has(tipo)) throw new HttpError(400, 'tipo inválido');

  if (typeof body.resultado !== 'string') throw new HttpError(400, 'resultado es obligatorio');
  if (body.resultado.length > 80) throw new HttpError(400, 'resultado demasiado largo');
  const resultado = body.resultado.trim().toLowerCase();
  if (!RESULTADOS_ACTIVIDAD.has(resultado)) throw new HttpError(400, 'resultado inválido');

  if (typeof body.detalle !== 'string') throw new HttpError(400, 'detalle es obligatorio');
  if (body.detalle.length > 5000) throw new HttpError(400, 'detalle demasiado largo');
  const detalle = body.detalle.trim();
  if (detalle === '') throw new HttpError(400, 'detalle no puede estar vacío');

  let fecha: string | null = null;
  if (Object.prototype.hasOwnProperty.call(body, 'fecha')) {
    if (body.fecha === null) throw new HttpError(400, 'fecha inválida');
    if (typeof body.fecha !== 'string') throw new HttpError(400, 'fecha inválida');
    const validada = validarFechaCanonical(body.fecha);
    if (new Date(validada).getTime() > Date.now()) throw new HttpError(400, 'fecha futura');
    fecha = validada;
  }

  const tieneProxima = Object.prototype.hasOwnProperty.call(body, 'proxima_accion');
  const tieneVence = Object.prototype.hasOwnProperty.call(body, 'vence_at');
  if (tieneProxima !== tieneVence) throw new HttpError(400, 'próxima acción y vencimiento deben ir juntos');

  let proxima_accion: string | undefined;
  let vence_at: string | undefined;
  if (tieneProxima) {
    if (body.proxima_accion === null || typeof body.proxima_accion !== 'string') throw new HttpError(400, 'próxima acción inválida');
    if (body.proxima_accion.length > 200) throw new HttpError(400, 'próxima acción demasiado larga');
    proxima_accion = body.proxima_accion.trim();
    if (proxima_accion === '') throw new HttpError(400, 'próxima acción vacía');

    if (body.vence_at === null || typeof body.vence_at !== 'string') throw new HttpError(400, 'vencimiento inválido');
    vence_at = validarFechaCanonical(body.vence_at);
  }

  return { tipo, resultado, detalle, fecha, proxima_accion, vence_at };
}

export function actividadesRouter(db: Db) {
  const router = Router();

  router.post('/registros/:id/actividades', (req, res) => {
    const user = actor(req);
    if (!['admin', 'asesor'].includes(user.role)) throw new HttpError(403, 'Sin acceso comercial');

    const registro = db.get<{ id: string; responsable_id: string | null; deleted_at: string | null }>(
      'SELECT id, responsable_id, deleted_at FROM crm_registros WHERE id = ?',
      [req.params.id]
    );
    if (!registro || registro.deleted_at) throw new HttpError(404, 'Registro no disponible');
    if (user.role !== 'admin' && registro.responsable_id !== user.id) throw new HttpError(403, 'Registro ajeno');

    const datos = validarCuerpo(req.body);

    const ahora = datos.fecha ?? new Date().toISOString();
    const actividadId = crypto.randomUUID();
    let tareaId: string | null = null;
    let responsableTarea: string | null = null;
    let venceAtFinal: string | null = null;
    let tituloFinal: string | null = null;

    if (datos.proxima_accion !== undefined && datos.vence_at !== undefined) {
      tareaId = crypto.randomUUID();
      responsableTarea = registro.responsable_id ?? user.id;
      venceAtFinal = datos.vence_at;
      tituloFinal = datos.proxima_accion;
    }

    // Una sola transaccion: actividad, su evento y, si aplica, tarea + evento.
    db.transaction(() => {
      db.run(
        `INSERT INTO crm_actividades (id, registro_id, tipo, resultado, detalle, fecha, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [actividadId, req.params.id, datos.tipo, datos.resultado, datos.detalle, ahora, user.id]
      );
      db.run(
        `INSERT INTO crm_historial (registro_id, accion, actor_id, entidad_id, created_at)
         VALUES (?, 'actividad', ?, ?, ?)`,
        [req.params.id, user.id, actividadId, ahora]
      );

      if (tareaId && responsableTarea && venceAtFinal && tituloFinal) {
        db.run(
          `INSERT INTO crm_tareas (id, registro_id, titulo, vence_at, responsable_id)
           VALUES (?, ?, ?, ?, ?)`,
          [tareaId, req.params.id, tituloFinal, venceAtFinal, responsableTarea]
        );
        db.run(
          `INSERT INTO crm_historial (registro_id, accion, actor_id, entidad_id, created_at)
           VALUES (?, 'tarea_creada', ?, ?, ?)`,
          [req.params.id, user.id, tareaId, ahora]
        );
      }
    });

    res.status(201).json({
      actividad: {
        id: actividadId,
        registro_id: req.params.id,
        tipo: datos.tipo,
        resultado: datos.resultado,
        detalle: datos.detalle,
        fecha: ahora,
        actor_id: user.id
      },
      tarea:
        tareaId && responsableTarea && venceAtFinal && tituloFinal
          ? {
              id: tareaId,
              registro_id: req.params.id,
              titulo: tituloFinal,
              vence_at: venceAtFinal,
              responsable_id: responsableTarea
            }
          : null
    });
  });

  return router;
}
