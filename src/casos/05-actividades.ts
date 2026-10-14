import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { actor, HttpError } from '../http.js';

const TIPOS = ['llamada', 'correo', 'reunion'];
const RESULTADOS = ['contactado', 'sin_respuesta'];
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function textoObligatorio(valor: unknown, max: number, campo: string): string {
  if (typeof valor !== 'string' || valor.length > max) throw new HttpError(400, `${campo} inválido`);
  const limpio = valor.trim();
  if (!limpio) throw new HttpError(400, `${campo} requerido`);
  return limpio;
}
function timestamp(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !TIMESTAMP.test(valor)) throw new HttpError(400, `${campo} inválido`);
  const fecha = new Date(valor);
  if (!Number.isFinite(fecha.getTime()) || fecha.toISOString() !== valor) throw new HttpError(400, `${campo} inválido`);
  return valor;
}
const presente = (b: Record<string, unknown>, campo: string) => Object.hasOwn(b, campo) && b[campo] !== undefined;

function leerCuerpo(body: unknown, ahora: string) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Cuerpo inválido');
  const b = body as Record<string, unknown>;
  const tipo = textoObligatorio(b.tipo, 80, 'tipo');
  if (!TIPOS.includes(tipo)) throw new HttpError(400, 'tipo inválido');
  const resultado = textoObligatorio(b.resultado, 80, 'resultado');
  if (!RESULTADOS.includes(resultado)) throw new HttpError(400, 'resultado inválido');
  const detalle = textoObligatorio(b.detalle, 5000, 'detalle');

  let fecha = ahora;
  if (presente(b, 'fecha')) {
    fecha = timestamp(b.fecha, 'fecha');
    if (fecha > ahora) throw new HttpError(400, 'fecha futura');
  }

  const hayAccion = presente(b, 'proxima_accion'), hayVence = presente(b, 'vence_at');
  if (hayAccion !== hayVence) throw new HttpError(400, 'proxima_accion y vence_at deben enviarse juntos');
  const tarea = hayAccion
    ? { titulo: textoObligatorio(b.proxima_accion, 200, 'proxima_accion'), vence_at: timestamp(b.vence_at, 'vence_at') }
    : null;
  return { tipo, resultado, detalle, fecha, tarea };
}

export function actividadesRouter(db: Db) {
  const router = Router();

  router.post('/registros/:id/actividades', (req, res) => {
    
    const user = actor(req);
    if (user.role !== 'admin' && user.role !== 'asesor') throw new HttpError(403, 'Sin acceso comercial');
   
    const registroId = req.params.id;
    const registro = db.get<{ responsable_id: string | null }>(
      'SELECT responsable_id FROM crm_registros WHERE id = ? AND deleted_at IS NULL', [registroId]);
    if (!registro) throw new HttpError(404, 'Registro no disponible');
    if (user.role === 'asesor' && registro.responsable_id !== user.id) throw new HttpError(403, 'Registro ajeno');
    
    const ahora = new Date().toISOString();
    const datos = leerCuerpo(req.body, ahora);
    
    const resultado = db.transaction(() => {
      const actividad = {
        id: randomUUID(), registro_id: registroId, tipo: datos.tipo, resultado: datos.resultado,
        detalle: datos.detalle, fecha: datos.fecha, actor_id: user.id,
      };
      db.run('INSERT INTO crm_actividades (id, registro_id, tipo, resultado, detalle, fecha, actor_id) VALUES (?,?,?,?,?,?,?)',
        [actividad.id, actividad.registro_id, actividad.tipo, actividad.resultado, actividad.detalle, actividad.fecha, actividad.actor_id]);
      db.run('INSERT INTO crm_historial (registro_id, accion, actor_id, entidad_id, created_at) VALUES (?,?,?,?,?)',
        [registroId, 'actividad', user.id, actividad.id, ahora]);

      let tarea = null;
      if (datos.tarea) {
        tarea = {
          id: randomUUID(), registro_id: registroId, titulo: datos.tarea.titulo,
          vence_at: datos.tarea.vence_at, responsable_id: registro.responsable_id ?? user.id,
        };
        db.run('INSERT INTO crm_tareas (id, registro_id, titulo, vence_at, responsable_id) VALUES (?,?,?,?,?)',
          [tarea.id, tarea.registro_id, tarea.titulo, tarea.vence_at, tarea.responsable_id]);
        db.run('INSERT INTO crm_historial (registro_id, accion, actor_id, entidad_id, created_at) VALUES (?,?,?,?,?)',
          [registroId, 'tarea_creada', user.id, tarea.id, ahora]);
      }
      return { actividad, tarea };
    });
    res.status(201).json(resultado);
  });

  return router;
}