-- CASO 1: filtros, relaciones, orden y paginación según CONTRATO.md.
SELECT p.id_pago, p.fecha_pago, p.id_credito, p.cedula_cliente,
  c.nombre_completo AS nombre_cliente, cr.estado AS estado_credito,
  p.metodo_pago,
  COALESCE(NULLIF(TRIM(p.operacion), ''), 'PAGO') AS operacion,
  CASE
    WHEN p.valor_total IS NOT NULL AND p.valor_total != 0 THEN p.valor_total
    ELSE COALESCE(p.capital, 0) + COALESCE(p.interes, 0) + COALESCE(p.aval, 0)
       + COALESCE(p.mora, 0) + COALESCE(p.cobranza, 0) + COALESCE(p.abono_extra, 0)
  END AS valor_total
FROM pagos p
LEFT JOIN clientes c ON c.cedula_cliente = p.cedula_cliente
LEFT JOIN creditos cr ON cr.id_credito = p.id_credito
WHERE p.deleted_at IS NULL
  AND (? IS NULL OR p.fecha_pago >= ?)
  AND (? IS NULL OR p.fecha_pago <= ?)
  AND (? IS NULL OR p.cedula_cliente = ?)
  AND (? IS NULL OR p.id_credito = ?)
ORDER BY p.fecha_pago DESC, p.id_pago DESC
LIMIT ? OFFSET ?;
