import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, HttpError, type Actor } from '../http.js';
// CASO 3: desarrolla las rutas, validaciones y transacciones del directorio.
// schema.sql, seed.sql y el contrato están listos. No cambies los datos iniciales.
function agenciaId(value: string): number {
  if (!/^\d+$/.test(value)) throw new HttpError(400, 'Agencia inválida');
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || id > 1000000) throw new HttpError(400, 'Agencia inválida');
  return id;
}
function resolveAgencia(db: Db, raw: string, user: Actor): number {
  const id = agenciaId(raw);
  const agencia = db.get<{ advisor_id: string | null }>(
    'SELECT advisor_id FROM agencias WHERE id=? AND deleted_at IS NULL', [id]);
  if (!agencia) throw new HttpError(404, 'Agencia no disponible');
  if (user.role !== 'admin' && agencia.advisor_id !== user.id) throw new HttpError(403, 'Agencia ajena');
  return id;
}
export function contactosRouter(_db: Db) {
  const router = Router();
  router.use((req, res) => {
    actor(req);
    res.status(501).json({ error: 'Directorio por implementar' });
  });
  return router;
}
