import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, HttpError, scalar, type Actor } from '../http.js';


const AUDIENCIA = `n.center=1 AND (n.broadcast=1 OR EXISTS(
  SELECT 1 FROM destinatarios d WHERE d.notification_id=n.id
  AND ((d.tipo='role' AND d.valor=?) OR (d.tipo='user' AND d.valor=?))))`;


function desdeAudiencia(user: Actor, ocultos: boolean) {
  return {
    sql: `FROM notificaciones n
          LEFT JOIN lecturas l ON l.notification_id=n.id AND l.user_email=?
          WHERE ${AUDIENCIA}${ocultos ? '' : ' AND l.hidden_at IS NULL'}`,
    params: [user.email, user.role, user.email],
  };
}

function listarVisibles(db: Db, user: Actor, limit: number) {
  const v = desdeAudiencia(user, false);
  return db.all(`SELECT n.id, n.title, n.created_at AS createdAt, l.read_at AS readAt ${v.sql}
    ORDER BY n.created_at DESC, n.id DESC LIMIT ?`, [...v.params, limit]);
}
function contarNoLeidas(db: Db, user: Actor): number {
  const v = desdeAudiencia(user, false);
  return db.get<{ total: number }>(`SELECT COUNT(*) AS total ${v.sql} AND l.read_at IS NULL`, v.params)!.total;
}

function estadoPropio(db: Db, user: Actor, id: string) {
  const v = desdeAudiencia(user, true);
  const fila = db.get<{ readAt: string | null; hiddenAt: string | null }>(
    `SELECT l.read_at AS readAt, l.hidden_at AS hiddenAt ${v.sql} AND n.id=?`, [...v.params, id]);
  if (!fila) throw new HttpError(404, 'Notificación no encontrada');
  return fila;
}

export function notificacionesRouter(db: Db) {
  const router = Router();

  router.get('/', (req, res) => {
    const user = actor(req), value = scalar(req.query.limit, '50');
    if (!/^-?\d+$/.test(value)) throw new HttpError(400, 'Límite inválido');
    const limit = Math.min(100, Math.max(1, Number(value)));
    res.json({ items: listarVisibles(db, user, limit), unreadCount: contarNoLeidas(db, user) });
  });

  router.patch('/:id/read', (req, res) => {
    const user = actor(req), id = req.params.id, now = new Date().toISOString();
    const readAt = db.transaction(() => {
      const estado = estadoPropio(db, user, id);
      if (estado.readAt) return estado.readAt; 
      db.run('INSERT INTO lecturas(notification_id,user_email,read_at) VALUES(?,?,?)', [id, user.email, now]);
      return now;
    });
    res.json({ id, readAt });
  });

  router.delete('/:id', (req, res) => {
    const user = actor(req), id = req.params.id, now = new Date().toISOString();
    const hiddenAt = db.transaction(() => {
      const estado = estadoPropio(db, user, id);
      if (estado.hiddenAt) return estado.hiddenAt;
      db.run(`INSERT INTO lecturas(notification_id,user_email,read_at,hidden_at) VALUES(?,?,?,?)
              ON CONFLICT(notification_id,user_email) DO UPDATE SET hidden_at=excluded.hidden_at`,
        [id, user.email, now, now]); 
      return now;
    });
    res.json({ id, hiddenAt });
  });

  router.post('/read-all', (req, res) => {
    const user = actor(req), now = new Date().toISOString();
    const v = desdeAudiencia(user, false);
    const updated = db.transaction(() => db.run(
      `INSERT INTO lecturas(notification_id,user_email,read_at)
       SELECT n.id, ?, ? ${v.sql} AND l.read_at IS NULL`, [user.email, now, ...v.params]));
    res.json({ updated });
  });

  router.post('/clear', (req, res) => {
    const user = actor(req), now = new Date().toISOString();
    const v = desdeAudiencia(user, false);
    const updated = db.transaction(() => db.run(
      `INSERT INTO lecturas(notification_id,user_email,read_at,hidden_at)
       SELECT n.id, ?, ?, ? ${v.sql}
       ON CONFLICT(notification_id,user_email) DO UPDATE SET hidden_at=excluded.hidden_at`,
      [user.email, now, now, ...v.params]));
    res.json({ updated });
  });

  return router;
}