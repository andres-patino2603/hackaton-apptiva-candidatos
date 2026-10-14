import { describe, it, expect } from 'vitest';
import { httpLab } from './http.js';

describe('Pruebas propias', () => {
  const { request, restart } = httpLab();
  const GET = (ruta: string, user = 'admin') => request(ruta, 'GET', undefined, user);
  // 1. PAGOS: paginación con filtros.
  // Detecta: total calculado después de paginar, filtros que no se combinan
  // con la paginación, páginas fuera de rango que fallan o cambian el total.
  it('pagina con filtros y mantiene el total', async () => {
    const p1 = await GET('/pagos/historial?cedula_cliente=DOC-A&limit=2&page=1');
    const p2 = await GET('/pagos/historial?cedula_cliente=DOC-A&limit=2&page=2');
    const p3 = await GET('/pagos/historial?cedula_cliente=DOC-A&limit=2&page=3');
    expect(p1.status).toBe(200);
    expect(p1.data).toMatchObject({ total: 3, page: 1, limit: 2, totalPages: 2 });
    expect(p1.data.items).toHaveLength(2);
    expect(p2.data.items).toHaveLength(1);
    expect(p3.data.items).toEqual([]);
    expect(p3.data.total).toBe(3); // página vacía conserva el total
    const ids = [...p1.data.items, ...p2.data.items].map((x: any) => x.id_pago);
    expect(new Set(ids).size).toBe(3); // sin repetidos entre páginas
  });

  // 2. PAGOS: relaciones opcionales, eliminados y monto alternativo.
  // Detecta: INNER JOIN que pierde el pago 5, pago eliminado (4) que aparece,
  // valor_total que no suma componentes cuando el registrado es nulo o cero.
  it('conserva pagos sin relaciones, oculta eliminados y calcula el monto', async () => {
    const r = await GET('/pagos/historial?limit=100');
    const ids = r.data.items.map((x: any) => x.id_pago).sort();
    expect(ids).toEqual([1, 2, 3, 5, 6, 7]);
    const p5 = r.data.items.find((x: any) => x.id_pago === 5);
    expect(p5).toMatchObject({
      nombre_cliente: null, estado_credito: null, id_credito: null, cedula_cliente: null,
    });
    for (const id of [2, 3]) {
      const p = r.data.items.find((x: any) => x.id_pago === id);
      expect(p.valor_total).toBeGreaterThan(0); // suma de componentes
    }
    expect(r.data.items.every((x: any) => x.operacion)).toBe(true); // nunca vacía
  });

  // 3. CONTACTOS: permiso denegado sin efectos.
  // Detecta: permisos que dejan a un asesor escribir en agencia ajena o a un
  // analista entrar, y escrituras que ocurren antes de comprobar permisos.
  it('niega escritura a asesor ajeno y analista sin crear nada', async () => {
    const antes = await GET('/agencias/2/asesores', 'admin');
    const ajeno = await request('/agencias/2/asesores', 'POST', { nombre_completo: 'Intruso' }, 'asesor-a');
    const analista = await request('/agencias/1/asesores', 'POST', { nombre_completo: 'Intruso' }, 'analista');
    expect(ajeno.status).toBe(403);
    expect(analista.status).toBe(403);
    const despues = await GET('/agencias/2/asesores', 'admin');
    expect(despues.data.total).toBe(antes.data.total);
  });

  // 4. CONTACTOS: baja idempotente y auditoría.
  // Detecta: bajas repetidas que duplican eventos, restauración que cambia el
  // ID, historial que no registra el estado anterior.
  it('baja repetida no duplica eventos y restaurar conserva el ID', async () => {
    const c = await request('/agencias/1/asesores', 'POST', { nombre_completo: 'Ana', correo: ' ANA@X.COM ' }, 'asesor-a');
    expect(c.status).toBe(201);
    expect(c.data.item.correo).toBe('ana@x.com');
    const id = c.data.item.id;
    await request(`/agencias/1/asesores/${id}`, 'DELETE', undefined, 'asesor-a');
    await request(`/agencias/1/asesores/${id}`, 'DELETE', undefined, 'asesor-a');
    const rest = await request(`/agencias/1/asesores/${id}/restaurar`, 'PATCH', undefined, 'asesor-a');
    expect(rest.data.id).toBe(id);
    expect(rest.data.deleted_at).toBeNull();
    const h = await GET(`/agencias/1/asesores/${id}/historial`, 'asesor-a');
    expect(h.data.map((e: any) => e.accion).sort()).toEqual(['baja', 'creacion', 'restauracion']);
    const baja = h.data.find((e: any) => e.accion === 'baja');
    expect(baja.anterior.deleted_at).toBeNull();
  });

  // 5. NOTIFICACIONES: aislamiento entre usuarios.
  // Detecta: lecturas u ocultamientos que se guardan en el aviso global y
  // afectan a otros usuarios, y contador que no baja al leer.
  it('leer u ocultar solo afecta al usuario que lo hace', async () => {
    const antes = await GET('/notifications', 'asesor-a');
    expect(antes.data.unreadCount).toBe(4);
    const leida = await request('/notifications/n2/read', 'PATCH', undefined, 'asesor-a');
    expect(leida.status).toBe(200);
    await request('/notifications/n7', 'DELETE', undefined, 'asesor-a');
    const a = await GET('/notifications', 'asesor-a');
    expect(a.data.items.map((x: any) => x.id)).not.toContain('n7');
    expect(a.data.unreadCount).toBe(2);
    const b = await GET('/notifications', 'asesor-b');
    const n2b = b.data.items.find((x: any) => x.id === 'n2');
    expect(n2b.readAt).toBeNull();
    expect(b.data.items.map((x: any) => x.id)).toContain('n7');
  });

  // 6. NOTIFICACIONES: idempotencia y 404 sin efectos.
  // Detecta: fechas que se sobrescriben al repetir, masivas que cuentan de más,
  // y acciones sobre avisos de otra audiencia que no devuelven 404.
  it('repetir operaciones conserva fechas y las masivas cuentan cambios reales', async () => {
    const r1 = await request('/notifications/n1/read', 'PATCH', undefined, 'asesor-a');
    const r2 = await request('/notifications/n1/read', 'PATCH', undefined, 'asesor-a');
    expect(r2.data.readAt).toBe(r1.data.readAt);
    const d1 = await request('/notifications/n2', 'DELETE', undefined, 'asesor-a');
    const d2 = await request('/notifications/n2', 'DELETE', undefined, 'asesor-a');
    expect(d2.data.hiddenAt).toBe(d1.data.hiddenAt);
    const ajeno = await request('/notifications/n4/read', 'PATCH', undefined, 'asesor-a'); // personal de B
    const fuera = await request('/notifications/n5/read', 'PATCH', undefined, 'asesor-a'); // center=0
    expect(ajeno.status).toBe(404);
    expect(fuera.status).toBe(404);
    const todo1 = await request('/notifications/read-all', 'POST', undefined, 'asesor-a');
    const todo2 = await request('/notifications/read-all', 'POST', undefined, 'asesor-a');
    expect(todo1.data.updated).toBe(2); // n3 y n7; n1 ya leída, n2 oculta
    expect(todo2.data.updated).toBe(0);
    const clear1 = await request('/notifications/clear', 'POST', undefined, 'asesor-a');
    const clear2 = await request('/notifications/clear', 'POST', undefined, 'asesor-a');
    expect(clear1.data.updated).toBe(3); // n1, n3, n7
    expect(clear2.data.updated).toBe(0);
  });

  // 7. ACTIVIDADES: rechazo sin escrituras (el caso que pide el enunciado).
  // Detecta: validar después de escribir, o dejar actividad/tarea/evento a medias.
  it('rechaza próxima acción sin fecha y no guarda nada', async () => {
    const r = await request('/crm/registros/r1/actividades', 'POST',
      { tipo: 'llamada', resultado: 'contactado', detalle: 'Prueba', proxima_accion: 'Volver a llamar' }, 'asesor-a');
    expect(r.status).toBe(400);
    const res = await GET('/crm/registros/r1/resumen', 'asesor-a');
    expect(res.data).toEqual({ actividades: [], tareas: [], eventos: [] });
  });

  // 8. ACTIVIDADES: éxito con tarea y orden de eventos.
  // Detecta: tarea sin responsable correcto, eventos faltantes o en orden
  // equivocado, y datos que no persisten.
  it('crea actividad y tarea con sus eventos en orden', async () => {
    const r = await request('/crm/registros/r1/actividades', 'POST', {
      tipo: 'reunion', resultado: 'sin_respuesta', detalle: 'Detalle',
      proxima_accion: 'Enviar propuesta', vence_at: '2030-01-01T10:00:00.000Z',
      actor_id: 'admin', // debe ignorarse
    }, 'asesor-a');
    expect(r.status).toBe(201);
    expect(r.data.actividad.actor_id).toBe('asesor-a');
    expect(r.data.tarea.responsable_id).toBe('asesor-a');
    const res = await GET('/crm/registros/r1/resumen', 'asesor-a');
    expect(res.data.actividades).toHaveLength(1);
    expect(res.data.tareas).toHaveLength(1);
    const eventos = [...res.data.eventos].sort((a: any, b: any) => a.id - b.id);
    expect(eventos.map((e: any) => e.accion)).toEqual(['actividad', 'tarea_creada']);
  });

  // 9. ACTIVIDADES: permisos por responsable.
  it('aplica permisos por responsable', async () => {
    const body = { tipo: 'correo', resultado: 'contactado', detalle: 'x' };
    expect((await request('/crm/registros/r2/actividades', 'POST', body, 'asesor-a')).status).toBe(403);
    expect((await request('/crm/registros/r4/actividades', 'POST', body, 'asesor-a')).status).toBe(403);
    expect((await request('/crm/registros/r3/actividades', 'POST', body, 'admin')).status).toBe(404);
    expect((await request('/crm/registros/r1/actividades', 'POST', body, 'analista')).status).toBe(403);
  });
});