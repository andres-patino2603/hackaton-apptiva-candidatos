import { describe, it, expect } from 'vitest';
import { httpLab } from './http.js';

describe('Caso 1 · historial de pagos', () => {
  const { request } = httpLab();
  const ids = (r: any) => r.data.items.map((p: any) => p.id_pago);

  
  it('pagina con filtros: total previo a paginar, orden estable y página fuera de rango', async () => {
    const p1 = await request('/pagos/historial?cedula_cliente=DOC-A&limit=2');
    expect(ids(p1)).toEqual([2, 1]);
    expect(p1.data).toMatchObject({ total: 3, page: 1, limit: 2, totalPages: 2 });
    const p2 = await request('/pagos/historial?cedula_cliente=DOC-A&limit=2&page=2');
    expect(ids(p2)).toEqual([7]);
    expect(p2.data.total).toBe(3);
    const p9 = await request('/pagos/historial?cedula_cliente=DOC-A&limit=2&page=9');
    expect(p9.data).toMatchObject({ items: [], total: 3, totalPages: 2 });
   
    const todos = await request('/pagos/historial');
    expect(ids(todos)).toEqual([6, 5, 3, 2, 1, 7]);
  });

  
  it('conserva pagos sin relaciones, excluye eliminados y calcula operación/valor_total', async () => {
    const r = await request('/pagos/historial');
    expect(r.data.total).toBe(6);
    expect(ids(r)).not.toContain(4);
    const byId = Object.fromEntries(r.data.items.map((p: any) => [p.id_pago, p]));
    expect(byId[5]).toEqual({
      id_pago: 5, fecha_pago: '2025-02-01', id_credito: null, cedula_cliente: null,
      nombre_cliente: null, estado_credito: null, metodo_pago: 'efectivo', operacion: 'PAGO', valor_total: 0,
    });
    expect(byId[1].operacion).toBe('PAGO');       
    expect(byId[1].valor_total).toBe(12500);      
    expect(byId[2].valor_total).toBe(12100);      
    expect(byId[3].valor_total).toBe(20500);      
    expect(byId[3].operacion).toBe('ABONO');
    expect(byId[2].nombre_cliente).toBe('Persona Demo A');
    expect(byId[2].estado_credito).toBe('activo');
  });
});

describe('Caso 3 · directorio de asesores', () => {
  const { request } = httpLab();

  
  it('deniega permisos y no escribe nada en la petición rechazada', async () => {
    const ajena = await request('/agencias/2/asesores', 'POST', { nombre_completo: 'Intruso' }, 'asesor-a');
    expect(ajena.status).toBe(403);
    expect((await request('/agencias/2/asesores', 'GET', undefined, 'asesor-a')).status).toBe(403);
    expect((await request('/agencias/1/asesores', 'GET', undefined, 'analista')).status).toBe(403);
    expect((await request('/agencias/1/asesores', 'GET', undefined, null)).status).toBe(401);
    expect((await request('/agencias/3/asesores', 'GET', undefined, 'admin')).status).toBe(404);

    const lista = await request('/agencias/2/asesores', 'GET', undefined, 'admin');
    expect(lista.status).toBe(200);
    expect(lista.data.total).toBe(1);
    expect(lista.data.items.map((c: any) => c.nombre_completo)).toEqual(['Contacto Beta']);
  });
});

describe('Caso 4 · notificaciones', () => {
  const { request } = httpLab();
  const ids = (r: any) => r.data.items.map((n: any) => n.id);

  
  it('aísla el ocultamiento por usuario y es idempotente', async () => {
    const a = await request('/notifications', 'GET', undefined, 'asesor-a');
    expect(ids(a)).toEqual(['n7', 'n3', 'n2', 'n1']);
    expect(a.data.unreadCount).toBe(4);

    const d1 = await request('/notifications/n1', 'DELETE', undefined, 'asesor-a');
    expect(d1.status).toBe(200);
    const d2 = await request('/notifications/n1', 'DELETE', undefined, 'asesor-a');
    expect(d2.data.hiddenAt).toBe(d1.data.hiddenAt);

    const a2 = await request('/notifications', 'GET', undefined, 'asesor-a');
    expect(ids(a2)).toEqual(['n7', 'n3', 'n2']);
    expect(a2.data.unreadCount).toBe(3);
    const b = await request('/notifications', 'GET', undefined, 'asesor-b');
    expect(ids(b)).toContain('n1');
    expect(b.data.unreadCount).toBe(4);

    
    const r1 = await request('/notifications/n1/read', 'PATCH', undefined, 'asesor-a');
    expect(r1.status).toBe(200);
    expect((await request('/notifications', 'GET', undefined, 'asesor-a')).data.items.some((n: any) => n.id === 'n1')).toBe(false);
  });
});

describe('Caso 5 · actividades comerciales', () => {
  const { request } = httpLab();
  const valido = { tipo: 'llamada', resultado: 'contactado', detalle: 'Conversación ficticia' };
  const vacio = { actividades: [], tareas: [], eventos: [] };

  
  it('rechaza próxima acción sin fecha y no guarda actividad, tarea ni evento', async () => {
    const r = await request('/crm/registros/r1/actividades', 'POST', { ...valido, proxima_accion: 'Llamar de nuevo' }, 'asesor-a');
    expect(r.status).toBe(400);
    expect((await request('/crm/registros/r1/actividades', 'POST', { ...valido, vence_at: '2030-01-01T10:00:00.000Z' }, 'asesor-a')).status).toBe(400);
    expect((await request('/crm/registros/r1/actividades', 'POST', { ...valido, proxima_accion: null, vence_at: null }, 'asesor-a')).status).toBe(400);
    expect((await request('/crm/registros/r1/actividades', 'POST', { ...valido, fecha: '2999-01-01T00:00:00.000Z' }, 'asesor-a')).status).toBe(400);
    expect((await request('/crm/registros/r1/actividades', 'POST', { ...valido, tipo: 'visita' }, 'asesor-a')).status).toBe(400);
    expect((await request('/crm/registros/r1/actividades', 'POST', { ...valido, detalle: '   ' }, 'asesor-a')).status).toBe(400);
    expect((await request('/crm/registros/r1/resumen', 'GET', undefined, 'asesor-a')).data).toEqual(vacio);
  });
});
