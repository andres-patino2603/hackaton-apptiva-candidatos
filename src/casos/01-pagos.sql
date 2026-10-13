-- CASO 1: implementar filtros, relaciones, total y paginación según CONTRATO.md.
-- Consultas pendientes; la ruta y validaciones ya están implementadas.
SELECT id_pago FROM pagos WHERE 1=0 AND (? IS NULL OR ? IS NOT NULL OR ? IS NULL OR ? IS NOT NULL OR ? IS NULL OR ? IS NOT NULL OR ? IS NULL OR ? IS NOT NULL) LIMIT ? OFFSET ?;