-- CASO 1: Conteo total de pagos para calcular totalPages.
-- Mismos JOINs y filtros que 01-pagos.sql, sin ORDER BY ni LIMIT/OFFSET.
-- Parámetros en orden: [fecha_inicio, fecha_inicio, fecha_fin, fecha_fin,
--                       cedula_cliente, cedula_cliente, id_credito, id_credito]
-- Siempre devuelve exactamente una fila con la columna "total".
SELECT
  COUNT(*) AS total

FROM pagos p
  LEFT JOIN clientes  c  ON c.cedula_cliente = p.cedula_cliente
  LEFT JOIN creditos  cr ON cr.id_credito    = p.id_credito

WHERE
  p.deleted_at IS NULL

  -- filtro fecha_inicio (inclusivo)
  AND (? IS NULL OR p.fecha_pago >= ?)

  -- filtro fecha_fin (inclusivo)
  AND (? IS NULL OR p.fecha_pago <= ?)

  -- filtro por cliente (coincidencia exacta)
  AND (? IS NULL OR p.cedula_cliente = ?)

  -- filtro por crédito (coincidencia exacta)
  AND (? IS NULL OR p.id_credito = ?);
