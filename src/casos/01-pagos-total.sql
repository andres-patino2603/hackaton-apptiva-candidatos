SELECT COUNT(*) AS total
FROM pagos p
LEFT JOIN clientes c ON c.cedula_cliente = p.cedula_cliente
LEFT JOIN creditos cr ON cr.id_credito = p.id_credito
WHERE p.deleted_at IS NULL
  AND (? IS NULL OR p.fecha_pago >= ?)
  AND (? IS NULL OR p.fecha_pago <= ?)
  AND (? IS NULL OR p.cedula_cliente = ?)
  AND (? IS NULL OR p.id_credito = ?);
