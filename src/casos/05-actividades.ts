import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { actor, HttpError } from '../http.js';

// CASO 5: endpoint completo de actividades comerciales.
const TIPOS = new Set(['llamada', 'correo', 'reunion']);
const RESULTADOS = new Set(['contactado', 'sin_respuesta']);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function texto(body: Record<string, unknown>, campo: string, max: number, requerido: boolean): string | null {
  const raw = body[campo];
  if (raw === undefined) {
    if (requerido) throw new HttpError(400, `${campo} requerido`);
    return null;
  }
  if (raw === null) throw new HttpError(400, `${campo} inválido`);
  if (typeof raw !== 'string') throw new HttpError(400, `${campo} inválido`);
  if (raw.length > max) throw new HttpError(400, `${campo} demasiado largo`);
  const limpio = raw.trim();
  if (requerido && limpio === '') throw new HttpError(400, `${campo} vacío`);
  return limpio === '' ? null : limpio;
}
function timestamp(body: Record<string, unknown>, campo: string): string | null {
  const raw = body[campo];
  if (raw === undefined) return null;
  if (raw === null || typeof raw !== 'string') throw new HttpError(400, `${campo} inválido`);
  if (!TIMESTAMP.test(raw)) throw new HttpError(400, `${campo} inválido`);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== raw) throw new HttpError(400, `${campo} inválido`);
  return raw;
}
export function actividadesRouter(db: Db) {
  const router = Router();
  router.post('/registros/:id/actividades', (req, res) => {
    const user = actor(req);
    if (!['admin', 'asesor'].includes(user.role)) throw new HttpError(403, 'Sin acceso comercial');
    const registro = db.get<{ responsable_id: string | null }>(
      'SELECT responsable_id FROM crm_registros WHERE id=? AND deleted_at IS NULL', [req.params.id]);
    if (!registro) throw new HttpError(404, 'Registro no disponible');
    if (user.role !== 'admin' && registro.responsable_id !== user.id) throw new HttpError(403, 'Registro ajeno');
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) throw new HttpError(400, 'Cuerpo inválido');
    const body = req.body as Record<string, unknown>;
    const tipo = texto(body, 'tipo', 80, true);
    const resultado = texto(body, 'resultado', 80, true);
    const detalle = texto(body, 'detalle', 5000, true);
    if (!tipo || !TIPOS.has(tipo.toLowerCase()) || tipo.length > 80) throw new HttpError(400, 'tipo inválido');
    if (!resultado || !RESULTADOS.has(resultado.toLowerCase())) throw new HttpError(400, 'resultado inválido');
    const fecha = timestamp(body, 'fecha') ?? new Date().toISOString();
    if (new Date(fecha).getTime() > Date.now()) throw new HttpError(400, 'fecha futura');
    const proximaAccion = texto(body, 'proxima_accion', 200, false);
    const venceAt = timestamp(body, 'vence_at');
    if ((proximaAccion === null) !== (venceAt === null)) throw new HttpError(400, 'próxima acción incompleta');
    const actividadId = randomUUID();
    const actividad = {
      id: actividadId, registro_id: req.params.id, tipo: tipo.toLowerCase(),
      resultado: resultado.toLowerCase(), detalle, fecha, actor_id: user.id,
    };
    let tarea: { id: string; registro_id: string; titulo: string; vence_at: string; responsable_id: string } | null = null;
    db.transaction(() => {
      db.run('INSERT INTO crm_actividades(id,registro_id,tipo,resultado,detalle,fecha,actor_id) VALUES(?,?,?,?,?,?,?)',
        [actividad.id, actividad.registro_id, actividad.tipo, actividad.resultado, actividad.detalle, actividad.fecha, actividad.actor_id]);
      db.run('INSERT INTO crm_historial(registro_id,accion,actor_id,entidad_id,created_at) VALUES(?,?,?,?,?)',
        [actividad.registro_id, 'actividad', user.id, actividad.id, new Date().toISOString()]);
      if (proximaAccion !== null && venceAt !== null) {
        const tareaId = randomUUID();
        const responsableId = registro.responsable_id ?? user.id;
        tarea = { id: tareaId, registro_id: req.params.id, titulo: proximaAccion, vence_at: venceAt, responsable_id: responsableId };
        db.run('INSERT INTO crm_tareas(id,registro_id,titulo,vence_at,responsable_id) VALUES(?,?,?,?,?)',
          [tarea.id, tarea.registro_id, tarea.titulo, tarea.vence_at, tarea.responsable_id]);
        db.run('INSERT INTO crm_historial(registro_id,accion,actor_id,entidad_id,created_at) VALUES(?,?,?,?,?)',
          [actividad.registro_id, 'tarea_creada', user.id, tarea.id, new Date().toISOString()]);
      }
    });
    res.status(201).json({ actividad, tarea });
  });
  return router;
}
