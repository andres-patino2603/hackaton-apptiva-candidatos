import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, HttpError, scalar } from '../http.js';

// CASO 4: módulo de notificaciones corregido.
// Regla de audiencia centralizada: una notificación es visible para un usuario si
//   center = 1  AND  (broadcast = 1 OR rol en destinatarios OR correo en destinatarios)
// Lectura y ocultamiento pertenecen al par (notification_id, user_email): nunca
// afectan a otros usuarios ni al aviso global. Ambas operaciones son idempotentes.

// ─── SQL de audiencia compartido ─────────────────────────────────────────────
// Devuelve notificaciones visibles (no ocultas) para el usuario.
// Parámetros: [role, email, role, email]  (se repiten para el EXISTS)
const AUDIENCE_VISIBLE_SQL = `
  SELECT n.id
  FROM notificaciones n
  WHERE n.center = 1
    AND (
      n.broadcast = 1
      OR EXISTS (
        SELECT 1 FROM destinatarios d
        WHERE d.notification_id = n.id
          AND (
            (d.tipo = 'role' AND d.valor = ?)
            OR (d.tipo = 'user' AND d.valor = ?)
          )
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM lecturas l
      WHERE l.notification_id = n.id
        AND l.user_email = ?
        AND l.hidden_at IS NOT NULL
    )
`;
// Parámetros: [role, email, email]

// ─── Helper: verifica que una notif pertenece a la audiencia del usuario ──────
// Incluye ocultas propias (para que lectura/ocultamiento repetido no dé 404).
function assertInAudience(db: Db, notifId: string, role: string, email: string): void {
  const row = db.get<{ id: string }>(
    `SELECT n.id FROM notificaciones n
     WHERE n.id = ?
       AND n.center = 1
       AND (
         n.broadcast = 1
         OR EXISTS (
           SELECT 1 FROM destinatarios d
           WHERE d.notification_id = n.id
             AND (
               (d.tipo = 'role' AND d.valor = ?)
               OR (d.tipo = 'user' AND d.valor = ?)
             )
         )
       )`,
    [notifId, role, email]
  );
  if (!row) throw new HttpError(404, 'Notificación no encontrada o fuera de audiencia');
}

export function notificacionesRouter(db: Db) {
  const router = Router();

  // ── GET / — Listado con unreadCount independiente del limit ────────────────
  router.get('/', (req, res) => {
    const user  = actor(req);
    const value = scalar(req.query.limit, '50');

    // Solo enteros; formatos no enteros → 400
    if (!/^-?\d+$/.test(value)) throw new HttpError(400, 'Límite inválido');
    const parsed = Number(value);
    // 0 y negativos → 1; >100 → 100
    const limit = Math.min(100, Math.max(1, parsed));

    // Items paginados: JOIN a lecturas del propio usuario para obtener readAt
    const items = db.all<{ id: string; title: string; createdAt: string; readAt: string | null }>(
      `SELECT n.id, n.title, n.created_at AS createdAt, l.read_at AS readAt
       FROM notificaciones n
       LEFT JOIN lecturas l
         ON l.notification_id = n.id AND l.user_email = ?
       WHERE n.center = 1
         AND (
           n.broadcast = 1
           OR EXISTS (
             SELECT 1 FROM destinatarios d
             WHERE d.notification_id = n.id
               AND (
                 (d.tipo = 'role' AND d.valor = ?)
                 OR (d.tipo = 'user' AND d.valor = ?)
               )
           )
         )
         AND (l.hidden_at IS NULL OR l.notification_id IS NULL)
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ?`,
      [user.email, user.role, user.email, limit]
    );

    // unreadCount: toda la audiencia visible no leída, SIN el limit
    const { total: unreadCount } = db.get<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM notificaciones n
       LEFT JOIN lecturas l
         ON l.notification_id = n.id AND l.user_email = ?
       WHERE n.center = 1
         AND (
           n.broadcast = 1
           OR EXISTS (
             SELECT 1 FROM destinatarios d
             WHERE d.notification_id = n.id
               AND (
                 (d.tipo = 'role' AND d.valor = ?)
                 OR (d.tipo = 'user' AND d.valor = ?)
               )
           )
         )
         AND (l.hidden_at IS NULL OR l.notification_id IS NULL)
         AND l.read_at IS NULL`,
      [user.email, user.role, user.email]
    );

    res.json({ items, unreadCount });
  });

  // ── PATCH /:id/read — Marcar como leída (idempotente) ─────────────────────
  router.patch('/:id/read', (req, res) => {
    const user = actor(req);
    assertInAudience(db, req.params.id, user.role, user.email);

    // Buscar lectura existente para conservar la fecha original
    const existing = db.get<{ read_at: string; hidden_at: string | null }>(
      'SELECT read_at, hidden_at FROM lecturas WHERE notification_id = ? AND user_email = ?',
      [req.params.id, user.email]
    );

    let readAt: string;

    if (existing) {
      // Idempotente: conserva la fecha original; no revierte ocultamiento
      readAt = existing.read_at;
    } else {
      readAt = new Date().toISOString();
      db.transaction(() => {
        db.run(
          'INSERT INTO lecturas (notification_id, user_email, read_at) VALUES (?, ?, ?)',
          [req.params.id, user.email, readAt]
        );
      });
    }

    res.json({ id: req.params.id, readAt });
  });

  // ── DELETE /:id — Ocultar para el usuario (idempotente, por usuario) ───────
  router.delete('/:id', (req, res) => {
    const user = actor(req);
    assertInAudience(db, req.params.id, user.role, user.email);

    const existing = db.get<{ read_at: string | null; hidden_at: string | null }>(
      'SELECT read_at, hidden_at FROM lecturas WHERE notification_id = ? AND user_email = ?',
      [req.params.id, user.email]
    );

    let hiddenAt: string;

    if (existing?.hidden_at) {
      // Idempotente: ya estaba oculta, conserva fecha original
      hiddenAt = existing.hidden_at;
    } else {
      hiddenAt = new Date().toISOString();
      db.transaction(() => {
        if (existing) {
          // Ya existe fila: actualizar hidden_at (conservar read_at)
          db.run(
            'UPDATE lecturas SET hidden_at = ? WHERE notification_id = ? AND user_email = ?',
            [hiddenAt, req.params.id, user.email]
          );
        } else {
          // No existe: insertar con read_at = hiddenAt (ocultar implica leer)
          db.run(
            'INSERT INTO lecturas (notification_id, user_email, read_at, hidden_at) VALUES (?, ?, ?, ?)',
            [req.params.id, user.email, hiddenAt, hiddenAt]
          );
        }
      });
    }

    res.json({ id: req.params.id, hiddenAt });
  });

  // ── POST /read-all — Marcar toda la audiencia visible como leída ───────────
  router.post('/read-all', (req, res) => {
    const user = actor(req);
    const now  = new Date().toISOString();

    // Solo las visibles NO leídas cuentan como cambio real
    const targets = db.all<{ id: string }>(
      `SELECT n.id FROM notificaciones n
       LEFT JOIN lecturas l
         ON l.notification_id = n.id AND l.user_email = ?
       WHERE n.center = 1
         AND (
           n.broadcast = 1
           OR EXISTS (
             SELECT 1 FROM destinatarios d
             WHERE d.notification_id = n.id
               AND (
                 (d.tipo = 'role' AND d.valor = ?)
                 OR (d.tipo = 'user' AND d.valor = ?)
               )
           )
         )
         AND (l.hidden_at IS NULL OR l.notification_id IS NULL)
         AND l.read_at IS NULL`,
      [user.email, user.role, user.email]
    );

    const updated = db.transaction(() => {
      let count = 0;
      for (const { id } of targets) {
        db.run(
          'INSERT INTO lecturas (notification_id, user_email, read_at) VALUES (?, ?, ?)',
          [id, user.email, now]
        );
        count++;
      }
      return count;
    });

    res.json({ updated });
  });

  // ── POST /clear — Ocultar toda la audiencia visible para el usuario ────────
  router.post('/clear', (req, res) => {
    const user = actor(req);
    const now  = new Date().toISOString();

    // Solo las visibles NO ocultas cuentan como cambio real
    const targets = db.all<{ id: string; read_at: string | null }>(
      `SELECT n.id, l.read_at FROM notificaciones n
       LEFT JOIN lecturas l
         ON l.notification_id = n.id AND l.user_email = ?
       WHERE n.center = 1
         AND (
           n.broadcast = 1
           OR EXISTS (
             SELECT 1 FROM destinatarios d
             WHERE d.notification_id = n.id
               AND (
                 (d.tipo = 'role' AND d.valor = ?)
                 OR (d.tipo = 'user' AND d.valor = ?)
               )
           )
         )
         AND (l.hidden_at IS NULL OR l.notification_id IS NULL)`,
      [user.email, user.role, user.email]
    );

    const updated = db.transaction(() => {
      let count = 0;
      for (const { id, read_at } of targets) {
        if (read_at !== null && read_at !== undefined) {
          // Ya tiene fila de lectura: solo agregar hidden_at
          db.run(
            'UPDATE lecturas SET hidden_at = ? WHERE notification_id = ? AND user_email = ?',
            [now, id, user.email]
          );
        } else {
          // No tiene fila: insertar con read_at = hidden_at = now
          db.run(
            'INSERT INTO lecturas (notification_id, user_email, read_at, hidden_at) VALUES (?, ?, ?, ?)',
            [id, user.email, now, now]
          );
        }
        count++;
      }
      return count;
    });

    res.json({ updated });
  });

  return router;
}
