import { Router } from 'express';
import type { Db } from '../db.js';
import { actor } from '../http.js';
// CASO 3: desarrolla las rutas, validaciones y transacciones del directorio.
// schema.sql, seed.sql y el contrato están listos. No cambies los datos iniciales.
export function contactosRouter(_db: Db) {
  const router = Router();
  router.use((req, res) => {
    actor(req);
    res.status(501).json({ error: 'Directorio por implementar' });
  });
  return router;
}
