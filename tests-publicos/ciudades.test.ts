import { describe, it, expect } from 'vitest';
import { httpLab } from './http.js';
describe('Caso 2 — ciudades', () => {
  const { request } = httpLab();
  it('combina q y country con AND (ambos cumplidos)', async () => {
    const hit = await request('/cities?q=ultima&country=bo');
    expect(hit.status).toBe(200); expect(hit.data.map((c:any)=>c.id)).toEqual(['city-26']);
    const miss = await request('/cities?q=lumina&country=bo');
    expect(miss.data).toEqual([]);
  });
  it('country solo hace subcadena insensible a mayúsculas en country y countryCode', async () => {
    const r = await request('/cities?country=BO');
    expect(r.status).toBe(200);
    expect(r.data.map((c:any)=>c.id).sort()).toEqual(['city-2','city-26']);
  });
  it('alcanza registros del final del catálogo sin limitar antes de filtrar', async () => {
    const r = await request('/cities?q=villa');
    expect(r.data).toHaveLength(20);
    expect(r.data[0].id).toBe('city-3');
    const last = await request('/cities?q=ultima');
    expect(last.data.map((c:any)=>c.id)).toEqual(['city-26']);
  });
  it('mantiene orden del catálogo y máximo veinte resultados', async () => {
    const r = await request('/cities');
    expect(r.data).toHaveLength(20);
    expect(r.data[0].id).toBe('city-1'); expect(r.data[19].id).toBe('city-20');
  });
});
