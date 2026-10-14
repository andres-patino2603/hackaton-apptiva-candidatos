SELECT COUNT(*) AS total
FROM pagos p
WHERE p.deleted_at IS NULL
  AND (? IS NULL OR p.fecha_pago >= ?)
  AND (? IS NULL OR p.fecha_pago <= ?)
  AND (? IS NULL OR p.cedula_cliente = ?)
  AND (? IS NULL OR p.id_credito = ?);