// Caso 4: centro de notificaciones.
// Guia rapida:
// - AUDIENCIA: aviso para el usuario por broadcast, rol o correo.
// - OCULTA: el usuario ya lo oculto.
// - VISIBLE: esta en la audiencia y no esta oculto.
// - GET '/': lista visibles con limit y unreadCount independiente.
// - PATCH '/:id/read': crea la primera fecha de lectura sin revertir ocultamiento.
// - DELETE '/:id': oculta solo para el actor y marca leido si no existia.
// - POST '/read-all': marca como leidos los visibles no leidos.
// - POST '/clear': oculta todos los visibles para el actor.
// - Todos los cambios por usuario se guardan en lecturas, nunca en notificaciones.
import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, HttpError, scalar } from '../http.js';

// Audiencia: el aviso es para el usuario por broadcast, rol o correo.
const AUDIENCIA = `n.center = 1 AND (n.broadcast = 1 OR EXISTS (
  SELECT 1 FROM destinatarios d
  WHERE d.notification_id = n.id
    AND ((d.tipo = 'role' AND d.valor = ?) OR (d.tipo = 'user' AND d.valor = ?))
))`;

// Condicion para saber si el usuario oculto este aviso.
const OCULTA = `EXISTS (
  SELECT 1 FROM lecturas hx
  WHERE hx.notification_id = n.id AND hx.user_email = ? AND hx.hidden_at IS NOT NULL
)`;

// Visible: esta en la audiencia y no fue ocultado por el usuario.
const VISIBLE = `${AUDIENCIA} AND NOT ${OCULTA}`;

export function notificacionesRouter(db: Db) {
  const router = Router();

  router.get('/', (req, res) => {
    const user = actor(req);
    const value = scalar(req.query.limit, '50');
    if (!/^-?\d+$/.test(value)) throw new HttpError(400, 'Límite inválido');
    let limit = Number(value);
    if (limit < 1) limit = 1;
    if (limit > 100) limit = 100;

    const items = db.all<{ id: string; title: string; createdAt: string; readAt: string | null }>(
      `SELECT n.id, n.title, n.created_at AS createdAt, l.read_at AS readAt
       FROM notificaciones n
       LEFT JOIN lecturas l ON l.notification_id = n.id AND l.user_email = ?
       WHERE ${VISIBLE}
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ?`,
      [user.email, user.role, user.email, user.email, limit]
    );

    const unreadCount = db.get<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM notificaciones n
       WHERE ${VISIBLE}
         AND NOT EXISTS (
           SELECT 1 FROM lecturas rx
           WHERE rx.notification_id = n.id AND rx.user_email = ? AND rx.read_at IS NOT NULL
         )`,
      [user.role, user.email, user.email, user.email]
    ).total;

    res.json({ items, unreadCount });
  });

  router.patch('/:id/read', (req, res) => {
    const user = actor(req);
    const now = new Date().toISOString();

    const aviso = db.get<{ id: string }>(
      `SELECT n.id FROM notificaciones n WHERE n.id = ? AND ${AUDIENCIA}`,
      [req.params.id, user.role, user.email]
    );
    if (!aviso) throw new HttpError(404, 'Notificación no disponible');

    let readAt = '';
    db.transaction(() => {
      const existente = db.get<{ read_at: string; hidden_at: string | null }>(
        'SELECT read_at, hidden_at FROM lecturas WHERE notification_id = ? AND user_email = ?',
        [req.params.id, user.email]
      );
      if (!existente) {
        readAt = now;
        db.run(
          'INSERT INTO lecturas (notification_id, user_email, read_at, hidden_at) VALUES (?, ?, ?, NULL)',
          [req.params.id, user.email, readAt]
        );
      } else {
        readAt = existente.read_at;
      }
    });

    res.json({ id: req.params.id, readAt });
  });

  router.delete('/:id', (req, res) => {
    const user = actor(req);
    const now = new Date().toISOString();

    const aviso = db.get<{ id: string }>(
      `SELECT n.id FROM notificaciones n WHERE n.id = ? AND ${AUDIENCIA}`,
      [req.params.id, user.role, user.email]
    );
    if (!aviso) throw new HttpError(404, 'Notificación no disponible');

    let hiddenAt = '';
    db.transaction(() => {
      const existente = db.get<{ read_at: string; hidden_at: string | null }>(
        'SELECT read_at, hidden_at FROM lecturas WHERE notification_id = ? AND user_email = ?',
        [req.params.id, user.email]
      );
      if (!existente) {
        hiddenAt = now;
        db.run(
          'INSERT INTO lecturas (notification_id, user_email, read_at, hidden_at) VALUES (?, ?, ?, ?)',
          [req.params.id, user.email, now, now]
        );
      } else if (existente.hidden_at === null) {
        hiddenAt = now;
        db.run(
          'UPDATE lecturas SET hidden_at = ? WHERE notification_id = ? AND user_email = ?',
          [now, req.params.id, user.email]
        );
      } else {
        hiddenAt = existente.hidden_at;
      }
    });

    res.json({ id: req.params.id, hiddenAt });
  });

  router.post('/read-all', (req, res) => {
    const user = actor(req);
    const now = new Date().toISOString();

    const items = db.all<{ id: string }>(
      `SELECT n.id FROM notificaciones n WHERE ${VISIBLE}
       AND NOT EXISTS (
         SELECT 1 FROM lecturas rx
         WHERE rx.notification_id = n.id AND rx.user_email = ? AND rx.read_at IS NOT NULL
       )`,
      [user.role, user.email, user.email, user.email]
    );

    db.transaction(() => {
      for (const item of items) {
        db.run(
          'INSERT OR IGNORE INTO lecturas (notification_id, user_email, read_at, hidden_at) VALUES (?, ?, ?, NULL)',
          [item.id, user.email, now]
        );
      }
    });

    res.json({ updated: items.length });
  });

  router.post('/clear', (req, res) => {
    const user = actor(req);
    const now = new Date().toISOString();

    const items = db.all<{ id: string }>(
      `SELECT n.id FROM notificaciones n WHERE ${VISIBLE}`,
      [user.role, user.email, user.email]
    );

    db.transaction(() => {
      for (const item of items) {
        const existente = db.get<{ read_at: string; hidden_at: string | null }>(
          'SELECT read_at, hidden_at FROM lecturas WHERE notification_id = ? AND user_email = ?',
          [item.id, user.email]
        );
        if (!existente) {
          db.run(
            'INSERT INTO lecturas (notification_id, user_email, read_at, hidden_at) VALUES (?, ?, ?, ?)',
            [item.id, user.email, now, now]
          );
        } else if (existente.hidden_at === null) {
          db.run(
            'UPDATE lecturas SET hidden_at = ? WHERE notification_id = ? AND user_email = ?',
            [now, item.id, user.email]
          );
        }
      }
    });

    res.json({ updated: items.length });
  });

  return router;
}
