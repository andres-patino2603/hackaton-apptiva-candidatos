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

---

## Fase 8 — Paginación por cursor 
### El problema de la paginación normal

La tabla de pagos se navega con offset (saltar N filas):

```
GET /pagos/historial?page=1&limit=20   → filas 1-20
GET /pagos/historial?page=2&limit=20   → filas 21-40
```

El riesgo: entre que se pide página 1 y página 2, otro usuario crea un pago nuevo. La fila nueva se mete arriba del todo. Cuando se pide página 2, "las filas 21-40" ahora son otras — una fila se repite y otra se pierde.

### La solución: cursor

En vez de pedir "página 3", se le pide al server: **"dame 20 más DESPUÉS de esta fila que ya vi"**.

```
1ª llamada:  /pagos/historial?limit=20
             → 20 filas + header: X-Next-Cursor: MjAyNS0wMi0wMnw2

2ª llamada:  /pagos/historial?limit=20&cursor=MjAyNS0wMi0wMnw2
             → 20 filas anteriores a "2025-02-02, id 6"
```

El cursor es solo el ID y fecha de la última fila vista, codificados en base64url. El server busca desde ahí hacia atrás. Aunque se inserten pagos nuevos, el punto de partida no cambia — nada se pierde ni se repite.

### Qué se implementó

| Archivo | Qué hace |
|---|---|
| `src/casos/01-pagos.ts` | Lee el param `cursor`. Sin cursor → se comporta igual que antes (offset, contrato intacto). Con cursor → usa SQL de keyset y devuelve header `X-Next-Cursor` con el puntero para la siguiente llamada |
| `src/casos/01-pagos-cursor.sql` | Misma consulta que la normal pero con "dame lo anterior a esta fecha+ID" en vez de OFFSET |

### Para qué sirve

1. **Scroll infinito / botón "cargar más"** en el frontend — trae 20 más sin números de página
2. **Robustez** — aunque entren datos nuevos, nada se pierde ni se duplica
3. **Demo técnica** — demuestra conocimiento de keyset pagination

