import { describe, it, expect } from 'vitest';
import { httpLab } from './http.js';
describe('Caso 5 — actividades comerciales', () => {
  const { request, restart } = httpLab();
  it('rechaza proxima_accion sin fecha y no escribe nada', async () => {
    const r = await request('/crm/registros/r1/actividades', 'POST',
      { tipo: 'llamada', resultado: 'contactado', detalle: 'Conversación', proxima_acon: 'x', proxima_accion: 'Llamar otra vez' }, 'asesor-a');
    expect(r.status).toBe(400);
    const resumen = await request('/crm/registros/r1/resumen', 'GET', undefined, 'asesor-a');
    expect(resumen.data.actividades).toHaveLength(0);
    expect(resumen.data.tareas).toHaveLength(0);
    expect(resumen.data.eventos).toHaveLength(0);
  });
  it('crea actividad con tarea, eventos en orden y responsable del registro', async () => {
    const r = await request('/crm/registros/r1/actividades', 'POST',
      { tipo: 'Correo', resultado: 'contactado', detalle: 'Envío de propuesta', proxima_accion: 'Confirmar envío', vence_at: '2025-02-01T10:00:00.000Z' }, 'asesor-a');
    expect(r.status).toBe(201);
    expect(r.data.actividad).toMatchObject({ registro_id: 'r1', tipo: 'correo', resultado: 'contactado', actor_id: 'asesor-a' });
    expect(r.data.tarea).toMatchObject({ registro_id: 'r1', titulo: 'Confirmar envío', responsable_id: 'asesor-a' });
    const resumen = await request('/crm/registros/r1/resumen', 'GET', undefined, 'asesor-a');
    expect(resumen.data.eventos.map((e:any)=>e.accion)).toEqual(['actividad', 'tarea_creada']);
    expect(resumen.data.eventos[0].entidad_id).toBe(r.data.actividad.id);
    expect(resumen.data.eventos[1].entidad_id).toBe(r.data.tarea.id);
  });
  it('permisos: analista 403, asesor ajeno 403, registro eliminado 404', async () => {
    expect((await request('/crm/registros/r1/actividades', 'POST', { tipo: 'llamada', resultado: 'contactado', detalle: 'x' }, 'analista')).status).toBe(403);
    expect((await request('/crm/registros/r1/actividades', 'POST', { tipo: 'llamada', resultado: 'contactado', detalle: 'x' }, 'asesor-b')).status).toBe(403);
    expect((await request('/crm/registros/r3/actividades', 'POST', { tipo: 'llamada', resultado: 'contactado', detalle: 'x' }, 'admin')).status).toBe(404);
    expect((await request('/crm/registros/r4/actividades', 'POST', { tipo: 'llamada', resultado: 'contactado', detalle: 'x' }, 'asesor-a')).status).toBe(403);
  });
  it('una escritura válida sobrevive reinicio', async () => {
    const r = await request('/crm/registros/r1/actividades', 'POST',
      { tipo: 'reunion', resultado: 'sin_respuesta', detalle: 'Reunión ficticia' }, 'admin');
    expect(r.status).toBe(201); expect(r.data.tarea).toBeNull();
    await restart();
    const resumen = await request('/crm/registros/r1/resumen', 'GET', undefined, 'admin');
    expect(resumen.data.actividades).toHaveLength(1);
    expect(resumen.data.actividades[0]).toMatchObject({ tipo: 'reunion', resultado: 'sin_respuesta', actor_id: 'admin' });
  });
});
