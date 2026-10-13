import { Router } from 'express';
import type { Db } from '../db.js';
import { actor, integer, scalar, HttpError } from '../http.js';
import { readFileSync } from 'node:fs';
function date(value: unknown): string | null {
  if (value === undefined) return null;
  const text = scalar(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new HttpError(400, 'Fecha inválida');
  const parsed = new Date(text + 'T00:00:00.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new HttpError(400, 'Fecha inválida');
  return text;
}
export function pagosRouter(db: Db) {
  const router = Router();
  const listSql = readFileSync(new URL('./01-pagos.sql', import.meta.url), 'utf8');
  const countSql = readFileSync(new URL('./01-pagos-total.sql', import.meta.url), 'utf8');
  router.get('/historial', (req, res) => {
    const user = actor(req);
    if (!['admin', 'analista'].includes(user.role)) throw new HttpError(403, 'Sin acceso al historial');
    const start = date(req.query.fecha_inicio), end = date(req.query.fecha_fin);
    if (start && end && start > end) throw new HttpError(400, 'Rango invertido');
    const client = req.query.cedula_cliente === undefined ? null : scalar(req.query.cedula_cliente);
    const credit = req.query.id_credito === undefined ? null : scalar(req.query.id_credito);
    if (client === '' || credit === '') throw new HttpError(400, 'Filtro vacío');
    const page = integer(req.query.page, 1, 1, 1000000), limit = integer(req.query.limit, 20);
    const filters = [start, start, end, end, client, client, credit, credit];
    const total = db.get<{ total: number }>(countSql, filters).total;
    const items = db.all(listSql, [...filters, limit, (page - 1) * limit]);
    res.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  });
  return router;
}
