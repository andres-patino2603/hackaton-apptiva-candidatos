# Aprobación — test completados

## Resumen en una frase por caso

| Caso | Qué resolvimos |
|---|---|
| 1 | Dos consultas SQL que no devolvían nada → historial completo con montos correctos, filtros y paginación estable |
| 2 | Buscador con 4 errores → encuentra por nombre/país/código ignorando tildes y mayúsculas, sin perder ciudades del final |
| 3 | 501 → directorio completo: listar, crear, editar, bajar, restaurar, historial, con permisos y auditoría |
| 4 | Mezcla de datos entre usuarios → avisos con estado personal, contadores reales, operaciones idempotentes |
| 5 | Router vacío → endpoint completo que valida, autoriza y persiste actividad + tarea + eventos en una sola transacción |

Estado final: 5/5 casos, 25/25 tests verdes, typecheck limpio.
