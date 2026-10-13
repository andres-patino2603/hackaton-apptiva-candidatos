import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, HttpError, scalar } from '../http.js';
// CASO 4: módulo legado didáctico con errores introducidos intencionalmente.
// Corrige el comportamiento y extrae las reglas compartidas sin cambiar la API.
export function notificacionesRouter(db: Db) {
  const router = Router();
  router.get('/', (req, res) => {
    const user = actor(req), value = scalar(req.query.limit, '50');
    if (!/^-?\d+$/.test(value)) throw new HttpError(400, 'Límite inválido');
    const limit = Math.min(100, Math.max(1, Number(value)));
    const items = db.all(`SELECT n.id,n.title,n.created_at AS createdAt,l.read_at AS readAt
      FROM notificaciones n LEFT JOIN lecturas l ON l.notification_id=n.id
      WHERE n.center=1 AND l.hidden_at IS NULL AND (n.broadcast=1 OR EXISTS(
        SELECT 1 FROM destinatarios d WHERE d.notification_id=n.id
        AND ((d.tipo='role' AND d.valor=?) OR (d.tipo='user' AND d.valor=?))))
      ORDER BY n.created_at DESC LIMIT ?`, [user.role,user.email,limit]);
    res.json({ items, unreadCount:items.filter(n => !n.readAt).length });
  });
  router.patch('/:id/read', (req, res) => {
    const user = actor(req), now = new Date().toISOString();
    db.transaction(() => db.run('INSERT OR REPLACE INTO lecturas(notification_id,user_email,read_at) VALUES(?,?,?)', [req.params.id,user.email,now]));
    res.json({id:req.params.id,readAt:now});
  });
  router.delete('/:id', (req, res) => {
    actor(req);
    db.transaction(() => db.run('UPDATE notificaciones SET center=0 WHERE id=?',[req.params.id]));
    res.json({id:req.params.id,hiddenAt:new Date().toISOString()});
  });
  router.post('/read-all', (req, res) => {
    const user = actor(req);
    const items = db.all<{id:string}>(`SELECT n.id FROM notificaciones n WHERE n.center=1
      AND (n.broadcast=1 OR EXISTS(SELECT 1 FROM destinatarios d WHERE d.notification_id=n.id
      AND ((d.tipo='role' AND d.valor=?) OR (d.tipo='user' AND d.valor=?))))`,[user.role,user.email]);
    db.transaction(() => {
      for (const item of items) db.run('INSERT OR IGNORE INTO lecturas(notification_id,user_email,read_at) VALUES(?,?,?)',[item.id,user.email,new Date().toISOString()]);
    });
    res.json({updated:items.length});
  });
  router.post('/clear', (req, res) => {
    const user = actor(req);
    const items = db.all<{id:string}>(`SELECT n.id FROM notificaciones n WHERE n.center=1
      AND (n.broadcast=1 OR EXISTS(SELECT 1 FROM destinatarios d WHERE d.notification_id=n.id
      AND ((d.tipo='role' AND d.valor=?) OR (d.tipo='user' AND d.valor=?))))`,[user.role,user.email]);
    db.transaction(() => {
      for (const item of items) db.run('UPDATE notificaciones SET center=0 WHERE id=?',[item.id]);
    });
    res.json({updated:items.length});
  });
  return router;
}
