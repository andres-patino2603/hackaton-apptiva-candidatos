import { describe, it, expect } from 'vitest';
import { httpLab } from './http.js';
describe('Ejemplos públicos del contrato', () => {
  const { request } = httpLab();
  it('la infraestructura responde', async () => {
    expect(await request('/health')).toEqual({status:200,data:{ok:true}});
  });
  it('filtra historial por cliente y devuelve el total', async () => {
    const r = await request('/pagos/historial?cedula_cliente=DOC-A');
    expect(r.status).toBe(200); expect(r.data.total).toBe(3);
    expect(r.data.items.map((p:any)=>p.id_pago)).toEqual([2,1,7]);
  });
  it('encuentra una ciudad ignorando tildes', async () => {
    const r = await request('/cities?q=L%C3%9AMINA');
    expect(r.data.map((c:any)=>c.id)).toEqual(['city-1']);
  });
  it('permite crear un contacto de mi agencia', async () => {
    const r = await request('/agencias/1/asesores','POST',{nombre_completo:' Demo público '},'asesor-a');
    expect(r.status).toBe(201); expect(r.data.item.nombre_completo).toBe('Demo público');
  });
  it('el contador de notificaciones no depende de limit', async () => {
    const r = await request('/notifications?limit=1','GET',undefined,'asesor-a');
    expect(r.data.items).toHaveLength(1); expect(r.data.unreadCount).toBe(4);
  });
  it('crea una actividad comercial mediante el nuevo endpoint', async () => {
    const r = await request('/crm/registros/r1/actividades','POST',{tipo:'llamada',resultado:'contactado',detalle:'Actividad ficticia de ejemplo'},'asesor-a');
    expect(r.status).toBe(201);
    expect(r.data.actividad).toMatchObject({registro_id:'r1',detalle:'Actividad ficticia de ejemplo',actor_id:'asesor-a'});
    expect(r.data.tarea).toBeNull();
  });
});
