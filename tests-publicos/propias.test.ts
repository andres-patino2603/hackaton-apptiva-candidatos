import { describe, it, expect } from 'vitest';
import { httpLab } from './http.js';

describe('Pruebas propias', () => {
  const { request } = httpLab();

  it('pagos: paginación y relaciones opcionales', async () => {
    const p1 = await request('/pagos/historial?limit=2&page=1');
    expect(p1.status).toBe(200);
    expect(p1.data.items.map((p: any) => p.id_pago)).toEqual([6, 5]);
    expect(p1.data.total).toBe(6);
    const sinRelacion = p1.data.items.find((p: any) => p.id_pago === 5);
    expect(sinRelacion.id_credito).toBeNull();
    expect(sinRelacion.cedula_cliente).toBeNull();
    expect(sinRelacion.nombre_cliente).toBeNull();
    expect(sinRelacion.estado_credito).toBeNull();
    expect(sinRelacion.operacion).toBe('PAGO');

    const p2 = await request('/pagos/historial?limit=2&page=2');
    expect(p2.data.items.map((p: any) => p.id_pago)).toEqual([3, 2]);
  });

  it('directorio: permiso denegado y agencia eliminada', async () => {
    const ajena = await request('/agencias/1/asesores', 'GET', undefined, 'asesor-b');
    expect(ajena.status).toBe(403);
    const analista = await request('/agencias/1/asesores', 'GET', undefined, 'analista');
    expect(analista.status).toBe(403);
    const eliminada = await request('/agencias/3/asesores', 'GET', undefined, 'asesor-a');
    expect(eliminada.status).toBe(404);
  });

  it('notificaciones: clear es idempotente e aislado por usuario', async () => {
    const primero = await request('/notifications/clear', 'POST', undefined, 'asesor-a');
    expect(primero.status).toBe(200);
    expect(primero.data.updated).toBe(4);
    const repetido = await request('/notifications/clear', 'POST', undefined, 'asesor-a');
    expect(repetido.data.updated).toBe(0);

    const otros = await request('/notifications', 'GET', undefined, 'asesor-b');
    expect(otros.data.items.length).toBe(4);
    expect(otros.data.unreadCount).toBe(4);
  });

  it('actividades: próxima acción sin fecha devuelve 400 sin efectos', async () => {
    const r = await request('/crm/registros/r1/actividades', 'POST', { tipo: 'llamada', resultado: 'contactado', detalle: 'prueba', proxima_accion: 'llamar luego' }, 'asesor-a');
    expect(r.status).toBe(400);

    const resumen = await request('/crm/registros/r1/resumen', 'GET', undefined, 'asesor-a');
    expect(resumen.data.actividades).toHaveLength(0);
    expect(resumen.data.tareas).toHaveLength(0);
    expect(resumen.data.eventos).toHaveLength(0);
  });

  it('ciudades: los filtros q y country se combinan con AND', async () => {
    const vacio = await request('/cities?q=lumina&country=bo');
    expect(vacio.data).toEqual([]);
    const uno = await request('/cities?q=%C3%BAltima&country=bo');
    expect(uno.data.map((c: any) => c.id)).toEqual(['city-26']);
  });
});
