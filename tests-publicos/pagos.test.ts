import { describe, it, expect } from 'vitest';
import { httpLab } from './http.js';
describe('Caso 1 — historial de pagos', () => {
  const { request, requestFull } = httpLab();
  it('pagina con filtros combinados y conserva total', async () => {
    const r = await request('/pagos/historial?fecha_inicio=2025-01-01&fecha_fin=2025-01-31&cedula_cliente=DOC-A&limit=2&page=1', 'GET', undefined, 'analista');
    expect(r.status).toBe(200);
    expect(r.data.total).toBe(2);
    expect(r.data.totalPages).toBe(1);
    expect(r.data.items.map((p:any)=>p.id_pago)).toEqual([2,1]);
    const page2 = await request('/pagos/historial?fecha_inicio=2025-01-01&fecha_fin=2025-01-31&cedula_cliente=DOC-A&limit=2&page=2', 'GET', undefined, 'analista');
    expect(page2.data.items).toEqual([]);
    expect(page2.data.total).toBe(2);
  });
  it('conserva pagos sin cliente ni crédito con campos relacionados en null', async () => {
    const solo5 = await request('/pagos/historial?fecha_inicio=2025-02-01&fecha_fin=2025-02-01', 'GET', undefined, 'analista');
    const p5 = solo5.data.items.find((p:any)=>p.id_pago === 5);
    expect(p5).toMatchObject({ cedula_cliente: null, id_credito: null, nombre_cliente: null, estado_credito: null, operacion: 'PAGO', valor_total: 0 });
  });
  it('rechaza asesor con 403 y valida parámetros con 400', async () => {
    expect((await request('/pagos/historial', 'GET', undefined, 'asesor-a')).status).toBe(403);
    expect((await request('/pagos/historial', 'GET', undefined, null)).status).toBe(401);
    expect((await request('/pagos/historial?fecha_inicio=2025-02-01&fecha_fin=2025-01-01')).status).toBe(400);
    expect((await request('/pagos/historial?limit=0')).status).toBe(400);
  });
  it('cursor recorre sin solapamiento y sin romper el contrato offset', async () => {
    const p1 = await requestFull('/pagos/historial?limit=3', 'GET', undefined, 'analista');
    expect(p1.status).toBe(200);
    expect(p1.data.items.map((p:any)=>p.id_pago)).toEqual([6,5,3]);
    expect(p1.data.total).toBe(6);
    const next1 = p1.headers.get('x-next-cursor');
    expect(next1).toBeTruthy();
    const p2 = await requestFull(`/pagos/historial?limit=3&cursor=${encodeURIComponent(next1!)}`, 'GET', undefined, 'analista');
    expect(p2.data.items.map((p:any)=>p.id_pago)).toEqual([2,1,7]);
    expect(p2.headers.get('x-next-cursor')).toBeNull();
    const sinCursor = await requestFull('/pagos/historial?limit=3&page=3', 'GET', undefined, 'analista');
    expect(sinCursor.data.items).toEqual([]);
    expect(sinCursor.headers.get('x-next-cursor')).toBeNull();
    expect((await request('/pagos/historial?cursor=basura')).status).toBe(400);
  });
});
