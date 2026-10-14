import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, HttpError, scalar } from '../http.js';

// ---------------------------------------------------------------------------
// REGLAS COMPARTIDAS (una sola definición para listado, contador, lectura,
// ocultamiento y operaciones masivas).
//
// AUDIENCIA: el aviso participa del centro (center=1) y pertenece al usuario si
// es general (broadcast=1), o su rol o su correo figuran como destinatarios.
// EXISTS evita duplicados cuando hay varias coincidencias.
// Parámetros: [rol, correo]
const AUDIENCIA = `n.center=1 AND (n.broadcast=1 OR EXISTS (
  SELECT 1 FROM destinatarios d WHERE d.notification_id=n.id
  AND ((d.tipo='role' AND d.valor=?) OR (d.tipo='user' AND d.valor=?))))`;

// VISIBLES: audiencia + estado propio del usuario (lecturas filtrada por su
// correo) + no oculta por él. Parámetros: [correo, rol, correo]
const VISIBLES = `FROM notificaciones n
  LEFT JOIN lecturas l ON l.notification_id=n.id AND l.user_email=?
  WHERE ${AUDIENCIA} AND l.hidden_at IS NULL`;

type Actor = { role: string; email: string };
const paramsVisibles = (u: Actor) => [u.email, u.role, u.email];

// Una fila en lecturas siempre tiene read_at, así que "sin fila" o
// "read_at nulo" significa no leída.
const NO_LEIDA = 'AND l.read_at IS NULL';

// Garantiza que el aviso existe y pertenece a la audiencia del usuario
// (esté o no oculto por él). Si no, 404 sin efectos.
function exigirAudiencia(db: Db, u: Actor, id: string) {
  const fila = db.get(
    `SELECT n.id FROM notificaciones n WHERE n.id=? AND ${AUDIENCIA}`,
    [id, u.role, u.email],
  );
  if (!fila) throw new HttpError(404, 'Notificación no encontrada');
}

// Crea la fila propia (leída ahora) solo si no existía; nunca pisa fechas.
function asegurarLectura(db: Db, u: Actor, id: string, now: string) {
  db.run(
    'INSERT OR IGNORE INTO lecturas(notification_id,user_email,read_at,hidden_at) VALUES(?,?,?,NULL)',
    [id, u.email, now],
  );
}

// Oculta solo para el usuario, conservando read_at previo y la primera
// fecha de ocultamiento.
function ocultar(db: Db, u: Actor, id: string, now: string) {
  asegurarLectura(db, u, id, now);
  db.run(
    'UPDATE lecturas SET hidden_at=? WHERE notification_id=? AND user_email=? AND hidden_at IS NULL',
    [now, id, u.email],
  );
}

export function notificacionesRouter(db: Db) {
  const router = Router();

  router.get('/', (req, res) => {
    const user = actor(req), value = scalar(req.query.limit, '50');
    if (!/^-?\d+$/.test(value)) throw new HttpError(400, 'Límite inválido');
    const limit = Math.min(100, Math.max(1, Number(value)));

    const items = db.all(
      `SELECT n.id, n.title, n.created_at AS createdAt, l.read_at AS readAt
       ${VISIBLES}
       ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
      [...paramsVisibles(user), limit],
    );
    // El contador consulta toda la audiencia visible, sin depender del límite.
    const conteo = db.get<{ n: number }>(
      `SELECT COUNT(*) AS n ${VISIBLES} ${NO_LEIDA}`,
      paramsVisibles(user),
    );
    res.json({ items, unreadCount: conteo?.n ?? 0 });
  });

  router.patch('/:id/read', (req, res) => {
    const user = actor(req), id = req.params.id, now = new Date().toISOString();
    let readAt = now;
    db.transaction(() => {
      exigirAudiencia(db, user, id);
      asegurarLectura(db, user, id, now); // no sobrescribe ni des-oculta
      const fila = db.get<{ read_at: string }>(
        'SELECT read_at FROM lecturas WHERE notification_id=? AND user_email=?',
        [id, user.email],
      );
      readAt = fila!.read_at; // conserva la primera fecha
    });
    res.json({ id, readAt });
  });

  router.delete('/:id', (req, res) => {
    const user = actor(req), id = req.params.id, now = new Date().toISOString();
    let hiddenAt = now;
    db.transaction(() => {
      exigirAudiencia(db, user, id);
      ocultar(db, user, id, now);
      const fila = db.get<{ hidden_at: string }>(
        'SELECT hidden_at FROM lecturas WHERE notification_id=? AND user_email=?',
        [id, user.email],
      );
      hiddenAt = fila!.hidden_at; // conserva la primera fecha
    });
    res.json({ id, hiddenAt });
  });

  router.post('/read-all', (req, res) => {
    const user = actor(req), now = new Date().toISOString();
    let updated = 0;
    db.transaction(() => {
      const pendientes = db.all<{ id: string }>(
        `SELECT n.id ${VISIBLES} ${NO_LEIDA}`,
        paramsVisibles(user),
      );
      for (const p of pendientes) asegurarLectura(db, user, p.id, now);
      updated = pendientes.length; // solo cambios reales
    });
    res.json({ updated });
  });

  router.post('/clear', (req, res) => {
    const user = actor(req), now = new Date().toISOString();
    let updated = 0;
    db.transaction(() => {
      const visibles = db.all<{ id: string }>(
        `SELECT n.id ${VISIBLES}`,
        paramsVisibles(user),
      );
      for (const v of visibles) ocultar(db, user, v.id, now);
      updated = visibles.length; // solo los que estaban visibles
    });
    res.json({ updated });
  });

  return router;
}