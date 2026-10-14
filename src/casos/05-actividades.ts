import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { actor, HttpError } from '../http.js';

const TIPOS = ['llamada', 'correo', 'reunion'];
const RESULTADOS = ['contactado', 'sin_respuesta'];
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Texto obligatorio con lista cerrada de valores (máx. 80 caracteres antes de trim).
function enumerado(v: unknown, permitidos: string[], campo: string): string {
  if (typeof v !== 'string' || v.length > 80) throw new HttpError(400, `${campo} inválido`);
  const t = v.trim();
  if (!permitidos.includes(t)) throw new HttpError(400, `${campo} inválido`);
  return t;
}

// Timestamp UTC canónico, fecha real. Null o tipos distintos de texto son inválidos.
function timestamp(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !TIMESTAMP.test(v)) throw new HttpError(400, `${campo} inválido`);
  const ms = Date.parse(v);
  if (Number.isNaN(ms) || new Date(ms).toISOString() !== v) throw new HttpError(400, `${campo} inválido`);
  return v;
}

function leerCuerpo(body: unknown, ahora: Date) {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw new HttpError(400, 'El cuerpo debe ser un objeto JSON');
  const b = body as Record<string, unknown>;

  const tipo = enumerado(b.tipo, TIPOS, 'tipo');
  const resultado = enumerado(b.resultado, RESULTADOS, 'resultado');

  if (typeof b.detalle !== 'string' || b.detalle.length > 5000) throw new HttpError(400, 'detalle inválido');
  const detalle = b.detalle.trim();
  if (!detalle) throw new HttpError(400, 'detalle inválido');

  let fecha = ahora.toISOString();
  if (b.fecha !== undefined) {
    fecha = timestamp(b.fecha, 'fecha');
    if (Date.parse(fecha) > ahora.getTime()) throw new HttpError(400, 'fecha no puede ser futura');
  }

  // proxima_accion y vence_at van juntos o ninguno.
  const hayAccion = b.proxima_accion !== undefined, hayVence = b.vence_at !== undefined;
  if (hayAccion !== hayVence) throw new HttpError(400, 'proxima_accion y vence_at deben venir juntos');
  let tarea: { titulo: string; vence_at: string } | null = null;
  if (hayAccion) {
    if (typeof b.proxima_accion !== 'string' || b.proxima_accion.length > 200) throw new HttpError(400, 'proxima_accion inválida');
    const titulo = b.proxima_accion.trim();
    if (!titulo) throw new HttpError(400, 'proxima_accion inválida');
    tarea = { titulo, vence_at: timestamp(b.vence_at, 'vence_at') };
  }
  return { tipo, resultado, detalle, fecha, tarea };
}

export function actividadesRouter(db: Db) {
  const router = Router();

  router.post('/registros/:id/actividades', (req, res) => {
    // 1) Autenticación (401) y rol (403)
    const u = actor(req);
    if (u.role !== 'admin' && u.role !== 'asesor') throw new HttpError(403, 'Sin acceso comercial');

    // 2) Registro: inexistente o eliminado (404); ajeno o sin responsable para asesor (403)
    const idRegistro = String(req.params.id);
    const registro = db.get<{ id: string; responsable_id: string | null }>(
      'SELECT id, responsable_id FROM crm_registros WHERE id=? AND deleted_at IS NULL', [idRegistro]);
    if (!registro) throw new HttpError(404, 'Registro no disponible');
    if (u.role === 'asesor' && registro.responsable_id !== u.id) throw new HttpError(403, 'Registro ajeno');

    // 3) Validación de entrada (400), antes de cualquier escritura
    const ahora = new Date();
    const datos = leerCuerpo(req.body, ahora);
    const now = ahora.toISOString();

    // 4) Escritura atómica: actividad, evento, y si aplica tarea y su evento
    const resultado = db.transaction(() => {
      const actividadId = randomUUID();
      db.run(
        'INSERT INTO crm_actividades(id,registro_id,tipo,resultado,detalle,fecha,actor_id) VALUES(?,?,?,?,?,?,?)',
        [actividadId, idRegistro, datos.tipo, datos.resultado, datos.detalle, datos.fecha, u.id]);
      db.run(
        'INSERT INTO crm_historial(registro_id,accion,actor_id,entidad_id,created_at) VALUES(?,?,?,?,?)',
        [idRegistro, 'actividad', u.id, actividadId, now]);

      let tarea: { id: string; registro_id: string; titulo: string; vence_at: string; responsable_id: string } | null = null;
      if (datos.tarea) {
        tarea = {
          id: randomUUID(), registro_id: idRegistro, titulo: datos.tarea.titulo,
          vence_at: datos.tarea.vence_at, responsable_id: registro.responsable_id ?? u.id,
        };
        db.run(
          'INSERT INTO crm_tareas(id,registro_id,titulo,vence_at,responsable_id) VALUES(?,?,?,?,?)',
          [tarea.id, tarea.registro_id, tarea.titulo, tarea.vence_at, tarea.responsable_id]);
        db.run(
          'INSERT INTO crm_historial(registro_id,accion,actor_id,entidad_id,created_at) VALUES(?,?,?,?,?)',
          [idRegistro, 'tarea_creada', u.id, tarea.id, now]);
      }
      return {
        actividad: {
          id: actividadId, registro_id: idRegistro, tipo: datos.tipo, resultado: datos.resultado,
          detalle: datos.detalle, fecha: datos.fecha, actor_id: u.id,
        },
        tarea,
      };
    });
    res.status(201).json(resultado);
  });

  return router;
}