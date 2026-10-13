import { Router } from 'express';
import type { Db } from '../db.js';

// CASO 5: construye el endpoint completo desde cero.
// El servidor monta este router en /crm. Debes declarar router.post(...),
// validar, autorizar, persistir en transacción y responder según CONTRATO.md.
// No hay controlador ni consultas de escritura implementados en este archivo.
export function actividadesRouter(_db: Db) {
  return Router();
}
