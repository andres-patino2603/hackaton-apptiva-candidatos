import { describe, it, expect } from 'vitest';
import { httpLab } from './http.js';
describe('Caso 4 — notificaciones', () => {
  const { request, restart } = httpLab();
  it('aislamiento: leer u ocultar de un usuario no afecta a otro', async () => {
    await request('/notifications/n3/read', 'PATCH', undefined, 'asesor-a');
    await request('/notifications/n3', 'DELETE', undefined, 'asesor-a');
    const a = await request('/notifications?limit=100', 'GET', undefined, 'asesor-a');
    expect(a.data.items.find((n:any)=>n.id === 'n3')).toBeUndefined();
    const b = await request('/notifications?limit=100', 'GET', undefined, 'admin');
    const n3b = b.data.items.find((n:any)=>n.id === 'n3');
    expect(n3b).toMatchObject({ id: 'n3', readAt: null });
  });
  it('idempotencia: read conserva fecha y clear devuelve cero en segunda llamada', async () => {
    const r1 = await request('/notifications/n2/read', 'PATCH', undefined, 'asesor-a');
    const r2 = await request('/notifications/n2/read', 'PATCH', undefined, 'asesor-a');
    expect(r2.data.readAt).toBe(r1.data.readAt);
    const c1 = await request('/notifications/clear', 'POST', undefined, 'asesor-a');
    expect(c1.data.updated).toBeGreaterThan(0);
    const c2 = await request('/notifications/clear', 'POST', undefined, 'asesor-a');
    expect(c2.data.updated).toBe(0);
  });
  it('read-all cuenta solo no leídos y sobrevive reinicio', async () => {
    const ra1 = await request('/notifications/read-all', 'POST', undefined, 'admin');
    expect(ra1.data.updated).toBeGreaterThan(0);
    const ra2 = await request('/notifications/read-all', 'POST', undefined, 'admin');
    expect(ra2.data.updated).toBe(0);
    await restart();
    const tras = await request('/notifications?limit=100', 'GET', undefined, 'admin');
    expect(tras.data.unreadCount).toBe(0);
  });
  it('404 para notificaciones fuera de audiencia o inexistentes', async () => {
    expect((await request('/notifications/n6/read', 'PATCH', undefined, 'asesor-a')).status).toBe(404);
    expect((await request('/notifications/no-existe', 'DELETE', undefined, 'admin')).status).toBe(404);
    expect((await request('/notifications/n5', 'DELETE', undefined, 'admin')).status).toBe(404);
  });
});
