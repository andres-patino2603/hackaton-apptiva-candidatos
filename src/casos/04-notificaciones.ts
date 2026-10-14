import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, HttpError, scalar, type Actor } from '../http.js';
// CASO 4: módulo legado didáctico con errores introducidos intencionalmente.
// Corrige el comportamiento y extrae las reglas compartidas sin cambiar la API.
const FROM_AUDIENCIA = `FROM notificaciones n
  LEFT JOIN lecturas l ON l.notification_id = n.id AND l.user_email = ?
  WHERE n.center = 1 AND l.hidden_at IS NULL
    AND (n.broadcast = 1 OR EXISTS (
      SELECT 1 FROM destinatarios d WHERE d.notification_id = n.id
      AND ((d.tipo = 'role' AND d.valor = ?) OR (d.tipo = 'user' AND d.valor = ?))))`;
function paramsAudiencia(user: Actor): [string, string, string] {
  return [user.email, user.role, user.email];
}
function enAudiencia(db: Db, user: Actor, id: string): boolean {
  return db.get<{ id: string }>(
    `SELECT n.id FROM notificaciones n
     WHERE n.center = 1 AND n.id = ?
       AND (n.broadcast = 1 OR EXISTS (
         SELECT 1 FROM destinatarios d WHERE d.notification_id = n.id
         AND ((d.tipo = 'role' AND d.valor = ?) OR (d.tipo = 'user' AND d.valor = ?))))`,
    [id, user.role, user.email]) !== undefined;
}
type LecturaPropia = { read_at: string | null; hidden_at: string | null };
function lecturaPropia(db: Db, user: Actor, id: string): LecturaPropia | undefined {
  return db.get<LecturaPropia>('SELECT read_at, hidden_at FROM lecturas WHERE notification_id=? AND user_email=?', [id, user.email]);
}
export function notificacionesRouter(db: Db) {
  const router = Router();
  router.get('/', (req, res) => {
    const user = actor(req), value = scalar(req.query.limit, '50');
    if (!/^-?\d+$/.test(value)) throw new HttpError(400, 'Límite inválido');
    const limit = Math.min(100, Math.max(1, Number(value)));
    const params = paramsAudiencia(user);
    const unreadCount = db.get<{ total: number }>(`SELECT COUNT(*) AS total ${FROM_AUDIENCIA} AND l.read_at IS NULL`, params).total;
    const items = db.all<{ id: string; title: string; createdAt: string; readAt: string | null }>(
      `SELECT n.id, n.title, n.created_at AS createdAt, l.read_at AS readAt ${FROM_AUDIENCIA}
       ORDER BY n.created_at DESC, n.id DESC LIMIT ?`, [...params, limit]);
    res.json({ items, unreadCount });
  });
  router.patch('/:id/read', (req, res) => {
    const user = actor(req);
    const id = req.params.id;
    if (!enAudiencia(db, user, id)) throw new HttpError(404, 'Notificación no disponible');
    const propia = lecturaPropia(db, user, id);
    if (propia?.read_at) { res.json({ id, readAt: propia.read_at }); return; }
    const now = new Date().toISOString();
    db.transaction(() => {
      if (propia) db.run('UPDATE lecturas SET read_at=? WHERE notification_id=? AND user_email=?', [now, id, user.email]);
      else db.run('INSERT INTO lecturas(notification_id,user_email,read_at) VALUES(?,?,?)', [id, user.email, now]);
    });
    res.json({ id, readAt: now });
  });
  router.delete('/:id', (req, res) => {
    const user = actor(req);
    const id = req.params.id;
    if (!enAudiencia(db, user, id)) throw new HttpError(404, 'Notificación no disponible');
    const propia = lecturaPropia(db, user, id);
    if (propia?.hidden_at) { res.json({ id, hiddenAt: propia.hidden_at }); return; }
    const now = new Date().toISOString();
    db.transaction(() => {
      if (propia) db.run('UPDATE lecturas SET hidden_at=? WHERE notification_id=? AND user_email=?', [now, id, user.email]);
      else db.run('INSERT INTO lecturas(notification_id,user_email,read_at,hidden_at) VALUES(?,?,?,?)', [id, user.email, now, now]);
    });
    res.json({ id, hiddenAt: now });
  });
  router.post('/read-all', (req, res) => {
    const user = actor(req);
    const pendientes = db.all<{ id: string }>(`SELECT n.id ${FROM_AUDIENCIA} AND l.read_at IS NULL`, paramsAudiencia(user));
    const now = new Date().toISOString();
    let updated = 0;
    db.transaction(() => {
      for (const item of pendientes) {
        updated += db.run('INSERT OR IGNORE INTO lecturas(notification_id,user_email,read_at) VALUES(?,?,?)', [item.id, user.email, now]);
      }
    });
    res.json({ updated });
  });
  router.post('/clear', (req, res) => {
    const user = actor(req);
    const visibles = db.all<{ id: string }>(`SELECT n.id ${FROM_AUDIENCIA}`, paramsAudiencia(user));
    const now = new Date().toISOString();
    let updated = 0;
    db.transaction(() => {
      for (const item of visibles) {
        const propia = lecturaPropia(db, user, item.id);
        if (propia) updated += db.run('UPDATE lecturas SET hidden_at=? WHERE notification_id=? AND user_email=? AND hidden_at IS NULL', [now, item.id, user.email]);
        else updated += db.run('INSERT INTO lecturas(notification_id,user_email,read_at,hidden_at) VALUES(?,?,?,?)', [item.id, user.email, now, now]);
      }
    });
    res.json({ updated });
  });
  return router;
}
