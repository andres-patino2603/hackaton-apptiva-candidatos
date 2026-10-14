import { describe, it, expect } from 'vitest';
import { httpLab } from './http.js';
describe('Caso 3 — directorio de asesores', () => {
  const { request } = httpLab();
  it('deniega 403 a asesor de otra agencia y a analista', async () => {
    expect((await request('/agencias/1/asesores', 'GET', undefined, 'asesor-b')).status).toBe(403);
    expect((await request('/agencias/1/asesores', 'GET', undefined, 'analista')).status).toBe(403);
    expect((await request('/agencias/3/asesores', 'GET', undefined, 'asesor-a')).status).toBe(404);
    expect((await request('/agencias/99/asesores', 'GET', undefined, 'admin')).status).toBe(404);
  });
  it('restaurar es idempotente y conserva el ID original', async () => {
    const baja = await request('/agencias/1/asesores/c1', 'DELETE', undefined, 'admin');
    expect(baja.status).toBe(200); expect(baja.data.id).toBe('c1'); expect(baja.data.deleted_at).not.toBeNull();
    const baja2 = await request('/agencias/1/asesores/c1', 'DELETE', undefined, 'admin');
    expect(baja2.data.deleted_at).toBe(baja.data.deleted_at);
    const restaurado = await request('/agencias/1/asesores/c1/restaurar', 'PATCH', undefined, 'admin');
    expect(restaurado.status).toBe(200); expect(restaurado.data.id).toBe('c1'); expect(restaurado.data.deleted_at).toBeNull();
    const eventos = await request('/agencias/1/asesores/c1/historial', 'GET', undefined, 'admin');
    expect(eventos.data.filter((e:any)=>e.accion === 'baja')).toHaveLength(1);
    expect(eventos.data.filter((e:any)=>e.accion === 'restauracion')).toHaveLength(1);
  });
  it('busca por subcadena literal: % y _ no son comodines', async () => {
    await request('/agencias/1/asesores', 'POST', { nombre_completo: 'Literal 100% Test', correo: 'pct@example.test' }, 'admin');
    const pct = await request('/agencias/1/asesores?search=%25', 'GET', undefined, 'admin');
    expect(pct.data.items.length).toBeGreaterThanOrEqual(1);
    expect(pct.data.items.every((c:any)=>c.nombre_completo.includes('%') || (c.correo ?? '').includes('%'))).toBe(true);
    const comodin = await request('/agencias/1/asesores?search=%25%25%25', 'GET', undefined, 'admin');
    expect(comodin.data.items).toEqual([]);
  });
  it('edición requiere nombre y registr evento con anterior y nuevo', async () => {
    const edit = await request('/agencias/2/asesores/c2', 'PATCH', { nombre_completo: 'Beta Editado', correo: null, telefono: null }, 'asesor-b');
    expect(edit.status).toBe(200); expect(edit.data.item.nombre_completo).toBe('Beta Editado');
    const eventos = await request('/agencias/2/asesores/c2/historial', 'GET', undefined, 'asesor-b');
    const ult = eventos.data[0];
    expect(ult.accion).toBe('actualizacion');
    expect(ult.anterior.nombre_completo).toBe('Contacto Beta');
    expect(ult.nuevo.nombre_completo).toBe('Beta Editado');
    expect((await request('/agencias/2/asesores/c2', 'PATCH', { correo: 'x@y.test' }, 'asesor-b')).status).toBe(400);
  });
});
