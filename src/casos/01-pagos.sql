-- CASO 1: Listado paginado del historial de pagos.
-- Parámetros en orden: [fecha_inicio, fecha_inicio, fecha_fin, fecha_fin,
--                       cedula_cliente, cedula_cliente, id_credito, id_credito,
--                       limit, offset]
SELECT
  p.id_pago,
  p.fecha_pago,
  p.id_credito,
  p.cedula_cliente,
  c.nombre_completo                                   AS nombre_cliente,
  cr.estado                                           AS estado_credito,
  p.metodo_pago,

  -- operacion: si es nula o vacía se devuelve 'PAGO'
  CASE
    WHEN p.operacion IS NULL OR p.operacion = '' THEN 'PAGO'
    ELSE p.operacion
  END                                                 AS operacion,

  -- valor_total: si el registrado es distinto de 0 y no nulo, se usa directamente;
  -- de lo contrario se suman los componentes tratando null como 0
  CASE
    WHEN p.valor_total IS NOT NULL AND p.valor_total != 0 THEN p.valor_total
    ELSE (
      COALESCE(p.capital,     0) +
      COALESCE(p.interes,     0) +
      COALESCE(p.aval,        0) +
      COALESCE(p.mora,        0) +
      COALESCE(p.cobranza,    0) +
      COALESCE(p.abono_extra, 0)
    )
  END                                                 AS valor_total

FROM pagos p
  LEFT JOIN clientes  c  ON c.cedula_cliente = p.cedula_cliente
  LEFT JOIN creditos  cr ON cr.id_credito    = p.id_credito

WHERE
  p.deleted_at IS NULL

  -- filtro fecha_inicio (inclusivo): activo solo si el parámetro no es null
  AND (? IS NULL OR p.fecha_pago >= ?)

  -- filtro fecha_fin (inclusivo)
  AND (? IS NULL OR p.fecha_pago <= ?)

  -- filtro por cliente (coincidencia exacta)
  AND (? IS NULL OR p.cedula_cliente = ?)

  -- filtro por crédito (coincidencia exacta)
  AND (? IS NULL OR p.id_credito = ?)

ORDER BY p.fecha_pago DESC, p.id_pago DESC

LIMIT ? OFFSET ?;
