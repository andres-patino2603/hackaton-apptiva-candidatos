import { describe, it, expect } from 'vitest';
import { httpLab } from './http.js';

describe('Pruebas propias — Humberto Hernando Diaz Rada', () => {
  const { request, restart } = httpLab();

  // ── CASO 1: Paginación con filtros combinados en historial de pagos ─────────
  // Detecta: que el total refleja todos los registros filtrados y que la segunda
  // página devuelve los items correctos sin repetir ni omitir.
  it('pagina el historial filtrando por cliente con limit=2 y page=2', async () => {
    // DOC-A tiene IDs [2,1,7] (orden fecha_pago DESC, id_pago DESC)
    // page=1 → [2,1], page=2 → [7]
    const r = await request('/pagos/historial?cedula_cliente=DOC-A&limit=2&page=2');
    expect(r.status).toBe(200);
    expect(r.data.total).toBe(3);
    expect(r.data.page).toBe(2);
    expect(r.data.limit).toBe(2);
    expect(r.data.totalPages).toBe(2);
    expect(r.data.items.map((p: any) => p.id_pago)).toEqual([7]);
  });

  // ── CASO 1b: Filtro combinado fecha + cliente ───────────────────────────────
  // Detecta: que los filtros de fecha y cliente se combinan con AND correctamente.
  // DOC-A tiene pagos en 2025-01-01, 2025-01-15 y 2024-12-31.
  // Con fecha_inicio=2025-01-01 y fecha_fin=2025-01-15 quedan IDs [2,1] (no el 7).
  it('combina filtros de fecha y cliente con AND', async () => {
    const r = await request(
      '/pagos/historial?cedula_cliente=DOC-A&fecha_inicio=2025-01-01&fecha_fin=2025-01-15'
    );
    expect(r.status).toBe(200);
    expect(r.data.total).toBe(2);
    expect(r.data.items.map((p: any) => p.id_pago)).toEqual([2, 1]);
  });

  // ── CASO 3: Permiso denegado al gestionar agencia ajena ────────────────────
  // Detecta: que asesor-b no puede crear contactos en la agencia 1 (de asesor-a).
  // Un 201 aquí sería una brecha de seguridad grave.
  it('rechaza con 403 al asesor que intenta crear contacto en agencia ajena', async () => {
    const r = await request(
      '/agencias/1/asesores',
      'POST',
      { nombre_completo: 'Intruso' },
      'asesor-b'  // agencia 1 pertenece a asesor-a
    );
    expect(r.status).toBe(403);
  });

  // ── CASO 3b: Analista tampoco puede acceder al directorio ──────────────────
  // Detecta: que el rol analista recibe 403 en cualquier agencia.
  it('rechaza con 403 al analista que intenta listar contactos', async () => {
    const r = await request('/agencias/1/asesores', 'GET', undefined, 'analista');
    expect(r.status).toBe(403);
  });

  // ── CASO 4: Idempotencia de lectura de notificación ────────────────────────
  // Detecta: que marcar como leída dos veces conserva la fecha original y no
  // reinicia ni cambia el readAt, garantizando aislamiento por usuario.
  it('marcar como leída dos veces conserva la fecha original', async () => {
    // Primera lectura
    const r1 = await request('/notifications/n1/read', 'PATCH', undefined, 'asesor-a');
    expect(r1.status).toBe(200);
    const readAtOriginal = r1.data.readAt;
    expect(readAtOriginal).toBeTruthy();

    // Segunda lectura — debe devolver la misma fecha
    const r2 = await request('/notifications/n1/read', 'PATCH', undefined, 'asesor-a');
    expect(r2.status).toBe(200);
    expect(r2.data.readAt).toBe(readAtOriginal);
  });

  // ── CASO 4b: Aislamiento entre usuarios en notificaciones ──────────────────
  // Detecta: que la lectura de asesor-a no afecta el unreadCount de asesor-b.
  // Regresión clásica: operaciones de un usuario afectan el estado de otro.
  it('leer una notificación no afecta el contador de otro usuario', async () => {
    // asesor-b tiene 4 notificaciones no leídas inicialmente (n1,n2,n4,n7)
    const antes = await request('/notifications', 'GET', undefined, 'asesor-b');
    expect(antes.status).toBe(200);
    const countAntes = antes.data.unreadCount;

    // asesor-a lee n1 — no debe cambiar el estado de asesor-b
    await request('/notifications/n1/read', 'PATCH', undefined, 'asesor-a');

    const despues = await request('/notifications', 'GET', undefined, 'asesor-b');
    expect(despues.status).toBe(200);
    expect(despues.data.unreadCount).toBe(countAntes);
  });

  // ── CASO 5: Rechaza próxima acción incompleta y no persiste nada ───────────
  // Detecta: que enviar proxima_accion sin vence_at devuelve 400 y que la BD
  // queda intacta (no se guardó actividad, tarea ni evento).
  it('rechaza 400 si proxima_accion viene sin vence_at y no persiste nada', async () => {
    // Intento de creación con proxima_accion pero sin vence_at
    const r = await request(
      '/crm/registros/r1/actividades',
      'POST',
      {
        tipo: 'llamada',
        resultado: 'contactado',
        detalle: 'Prueba de validación parcial',
        proxima_accion: 'Llamar de nuevo',
        // vence_at intencionalmente ausente
      },
      'asesor-a'
    );
    expect(r.status).toBe(400);

    // Verificar que no quedó ningún registro en la BD
    const resumen = await request('/crm/registros/r1/resumen', 'GET', undefined, 'asesor-a');
    expect(resumen.status).toBe(200);
    expect(resumen.data.actividades).toHaveLength(0);
    expect(resumen.data.tareas).toHaveLength(0);
    expect(resumen.data.eventos).toHaveLength(0);
  });

  // ── CASO 5b: Creación exitosa con tarea y eventos atómicos ─────────────────
  // Detecta: que el POST 201 crea actividad + tarea + 2 eventos en crm_historial,
  // y que el evento de actividad precede al de tarea (IDs secuenciales).
  it('crea actividad con tarea y registra dos eventos en orden correcto', async () => {
    const r = await request(
      '/crm/registros/r1/actividades',
      'POST',
      {
        tipo: 'reunion',
        resultado: 'contactado',
        detalle: 'Reunión de seguimiento con el prospecto',
        proxima_accion: 'Enviar propuesta comercial',
        vence_at: '2025-12-31T10:00:00.000Z',
      },
      'asesor-a'
    );
    expect(r.status).toBe(201);

    // Estructura de actividad
    expect(r.data.actividad).toMatchObject({
      registro_id: 'r1',
      tipo: 'reunion',
      resultado: 'contactado',
      actor_id: 'asesor-a',
    });

    // Estructura de tarea
    expect(r.data.tarea).not.toBeNull();
    expect(r.data.tarea).toMatchObject({
      registro_id:    'r1',
      titulo:         'Enviar propuesta comercial',
      vence_at:       '2025-12-31T10:00:00.000Z',
      responsable_id: 'asesor-a',
    });

    // Verificar persistencia y orden de eventos vía GET /resumen
    const resumen = await request('/crm/registros/r1/resumen', 'GET', undefined, 'asesor-a');
    expect(resumen.status).toBe(200);
    expect(resumen.data.actividades).toHaveLength(1);
    expect(resumen.data.tareas).toHaveLength(1);
    expect(resumen.data.eventos).toHaveLength(2);

    // El evento de actividad debe tener ID menor que el de tarea (orden secuencial)
    const [evActividad, evTarea] = resumen.data.eventos;
    expect(evActividad.accion).toBe('actividad');
    expect(evTarea.accion).toBe('tarea_creada');
    expect(evActividad.id).toBeLessThan(evTarea.id);
  });

  // ── CASO 5c: Persistencia tras reinicio del proceso ────────────────────────
  // Detecta: que los datos escritos en la BD sobreviven al reinicio del servidor,
  // verificando que la transacción se guardó correctamente en disco.
  it('la actividad persiste tras reiniciar el proceso', async () => {
    // Crear actividad
    const create = await request(
      '/crm/registros/r1/actividades',
      'POST',
      { tipo: 'correo', resultado: 'sin_respuesta', detalle: 'Correo sin respuesta enviado' },
      'asesor-a'
    );
    expect(create.status).toBe(201);
    const actividadId = create.data.actividad.id;

    // Reiniciar el servidor (nuevo proceso, misma BD)
    await restart();

    // Verificar que la actividad sigue ahí
    const resumen = await request('/crm/registros/r1/resumen', 'GET', undefined, 'asesor-a');
    expect(resumen.status).toBe(200);
    const ids = resumen.data.actividades.map((a: any) => a.id);
    expect(ids).toContain(actividadId);
  });
});
