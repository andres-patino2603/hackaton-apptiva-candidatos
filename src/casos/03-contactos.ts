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
function texto(value: unknown, campo: string, max: number): string {
  if (typeof value !== 'string') throw new HttpError(400, `${campo} inválido`);
  if (value.length > max) throw new HttpError(400, `${campo} demasiado largo`);
  return value.trim();
}
function normNombre(value: unknown): string {
  const nombre = texto(value, 'nombre_completo', 150);
  if (!nombre) throw new HttpError(400, 'nombre_completo vacío');
  return nombre;
}
function normCorreo(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const correo = texto(value, 'correo', 255).toLowerCase();
  if (correo === '') return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new HttpError(400, 'correo inválido');
  return correo;
}
function normTelefono(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const limpio = texto(value, 'telefono', 30).replace(/[^+\d]/g, '');
  const resultado = limpio.startsWith('+') ? '+' + limpio.slice(1).replace(/\+/g, '') : limpio.replace(/\+/g, '');
  return resultado === '' ? null : resultado;
}
type Coincidencia = { id: string; nombre_completo: string };
function findCoincidencias(db: Db, idAgencia: number, correo: string | null, telefono: string | null, excluirId: string | null): Coincidencia[] {
  return db.all<Coincidencia>(
    `SELECT id, nombre_completo FROM contactos
     WHERE id_agencia = ? AND deleted_at IS NULL AND id != ?
       AND ((? IS NOT NULL AND correo = ?) OR (? IS NOT NULL AND telefono = ?))`,
    [idAgencia, excluirId ?? '', correo, correo, telefono, telefono]);
}
export function contactosRouter(_db: Db) {
  const router = Router();
  router.use((req, res) => {
    actor(req);
    res.status(501).json({ error: 'Directorio por implementar' });
  });
  return router;
}
