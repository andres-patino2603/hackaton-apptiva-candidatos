// Infraestructura de lectura entregada para observar el resultado del caso 5 por HTTP.
// El candidato implementa la escritura, no este endpoint auxiliar.
import { Router } from 'express';
import type { Db } from './db.js';
import { actor, HttpError } from './http.js';
export function crmLecturaRouter(db: Db) {
  const router = Router();
  router.get('/registros/:id/resumen', (req, res) => {
    const user = actor(req);
    if (!['admin','asesor'].includes(user.role)) throw new HttpError(403, 'Sin acceso comercial');
    const registro = db.get<{responsable_id:string|null}>('SELECT responsable_id FROM crm_registros WHERE id=? AND deleted_at IS NULL', [req.params.id]);
    if (!registro) throw new HttpError(404, 'Registro no disponible');
    if (user.role !== 'admin' && registro.responsable_id !== user.id) throw new HttpError(403, 'Registro ajeno');
    res.json({
      actividades: db.all('SELECT * FROM crm_actividades WHERE registro_id=? ORDER BY fecha,id',[req.params.id]),
      tareas: db.all('SELECT * FROM crm_tareas WHERE registro_id=? ORDER BY vence_at,id',[req.params.id]),
      eventos: db.all('SELECT * FROM crm_historial WHERE registro_id=? ORDER BY id',[req.params.id]),
    });
  });
  return router;
}
