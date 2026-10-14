# Decisiones y comprobaciones de mi entrega

Nombre o identificador del participante: Humberto Hernando Diaz Rada

## Estado de cada caso

| Caso | Completo/parcial | Comprobaciones | Pendiente |
|---|---|---|---|
| Historial SQL | Completo | Verificado con seed: 6 pagos activos, ID 4 excluido, ID 5 sin relaciones devuelve null, IDs 2 y 3 suman componentes, orden DESC | — |
| Ciudades | Completo | Verificado con ejemplos del contrato: `/cities?q=última&country=bo` devuelve solo city-26; `/cities?q=lumina&country=bo` devuelve [] | — |
| Directorio | Completo | CRUD completo con permisos, auditoría transaccional, baja/restauración idempotentes y coincidencias | — |
| Notificaciones | Completo | Aislamiento por usuario verificado, idempotencia en lectura/ocultamiento, unreadCount independiente del limit, operaciones masivas transaccionales | — |
| Endpoint de actividades | Completo | POST validado, transacción con actividad + historial + tarea opcional, permisos por responsable | — |

## Decisiones de diseño

### Caso 1 — Historial de pagos (SQL)

- Se usaron `LEFT JOIN` a `clientes` y `creditos` para conservar pagos sin relaciones (el pago ID 5 no tiene cliente ni crédito y debe aparecer con esos campos en null).
- Cada filtro opcional sigue el patrón `(? IS NULL OR campo = ?)`: cuando el controller envía null, la condición se ignora; cuando envía un valor, filtra. Esto permite combinar cualquier subconjunto de filtros con AND sin SQL dinámico.
- `operacion`: se usa `CASE WHEN operacion IS NULL OR operacion = '' THEN 'PAGO'` para cubrir tanto el nulo (ID 1) como la cadena vacía (ID 5).
- `valor_total`: `CASE WHEN valor_total IS NOT NULL AND valor_total != 0 THEN valor_total ELSE COALESCE(capital,0)+COALESCE(interes,0)+COALESCE(aval,0)+COALESCE(mora,0)+COALESCE(cobranza,0)+COALESCE(abono_extra,0) END`. Así el valor registrado tiene prioridad si es distinto de cero (ID 1 y 6), y los IDs 2 y 3 obtienen la suma de componentes.
- Orden estable: `fecha_pago DESC, id_pago DESC` garantiza que ante igual fecha el resultado sea determinista.
- `01-pagos-total.sql` replica exactamente los mismos JOINs y filtros pero solo devuelve `COUNT(*) AS total`, sin ORDER BY ni LIMIT/OFFSET, para que siempre retorne una única fila incluso con cero coincidencias.

### Caso 2 — Buscador de ciudades

Se encontraron tres regresiones intencionales en el código original:

**Bug 1 — slice antes del filter:** `.slice(0, 20)` se aplicaba sobre el catálogo completo antes de filtrar, por lo que las ciudades ubicadas después de la posición 20 en el catálogo nunca podían aparecer en los resultados. Corrección: mover el `.slice(0, 20)` al final, después del `.filter()`.

**Bug 2 — operador lógico incorrecto (`||` en vez de `&&`):** cuando se enviaban ambos parámetros (`q` y `country`), la condición usaba OR entre ellos, por lo que bastaba que uno coincidiera para incluir la ciudad. El contrato exige que ambos filtros se cumplan simultáneamente. Corrección: cambiar `||` por `&&`.

**Bug 3 — sin normalización de mayúsculas ni tildes:** la comparación era sensible a mayúsculas y no eliminaba diacríticos (tildes), lo que hacía fallar búsquedas como `última` o `Bolivia`. El contrato exige normalización Unicode NFD. Corrección: función `normalize()` que aplica `.toLowerCase()` + `.normalize('NFD')` + eliminación de combining characters (`\p{M}`), aplicada tanto al texto de búsqueda como a los campos de cada ciudad.

### Caso 5 — Endpoint de actividades comerciales

- El router se monta en `/crm` desde `server.ts`. La ruta declarada es `POST /registros/:id/actividades`.
- Permisos: admin puede gestionar cualquier registro activo; asesor solo si `registro.responsable_id === user.id`. Si el registro no tiene responsable o pertenece a otro asesor, se devuelve 403.
- Validación estricta: se rechazan `null` explícitos en campos opcionales (`fecha`, `proxima_accion`, `vence_at`) ya que el contrato dice que `null` no equivale a omitir. Campos prohibidos (`actor_id`, `responsable_id`, `registro_id`) en el body lanzan 400. Ninguna validación fallida produce escrituras.
- `fecha`: si se omite se usa `new Date().toISOString()`; si se envía debe ser timestamp canónico `YYYY-MM-DDTHH:mm:ss.sssZ`, fecha real y no futura (verificado con round-trip de `Date.toISOString()`).
- `proxima_accion` y `vence_at` deben venir juntos o ninguno; si falta uno de los dos se devuelve 400.
- `vence_at` de la tarea puede ser pasado (se registra lo informado, sin imponer vencimiento futuro).
- Transacción única: inserta `crm_actividades` → evento `actividad` en `crm_historial` → (si hay próxima acción) `crm_tareas` → evento `tarea_creada`. El orden de eventos garantiza que el ID secuencial de actividad sea menor que el de tarea.
- Responsable de la tarea: `registro.responsable_id ?? user.id` — si el registro no tiene responsable (caso r4), el actor autenticado asume el rol.

**Qué ocurre si una escritura falla dentro de la transacción:**
`db.transaction()` ejecuta `BEGIN IMMEDIATE` al inicio y `ROLLBACK` si se lanza cualquier excepción. Si por ejemplo falla la inserción de `crm_tareas` (constraint, etc.), el ROLLBACK deshace también la actividad y el primer evento de historial ya insertados en esa misma transacción. La base queda en el estado anterior y el servidor responde con 500. No quedan registros huérfanos ni parciales.



Se encontraron cinco regresiones en el módulo legado:

**Bug 1 — unreadCount dependía del limit:** se calculaba como `items.filter(n => !n.readAt).length` sobre la lista ya paginada. Corrección: query separada `COUNT(*)` sobre toda la audiencia visible no leída, sin aplicar `LIMIT`.

**Bug 2 — lecturas mezcladas entre usuarios:** el `LEFT JOIN lecturas` no filtraba por `user_email`, por lo que la lectura de un usuario podía aparecer en el resultado de otro. Corrección: `LEFT JOIN lecturas l ON l.notification_id = n.id AND l.user_email = ?`.

**Bug 3 — PATCH /read sobreescribía la fecha:** usaba `INSERT OR REPLACE` que elimina y vuelve a insertar la fila, cambiando la fecha de lectura original. Corrección: verificar si ya existe lectura y conservar la fecha; solo insertar si es la primera vez.

**Bug 4 — DELETE modificaba `center=0` globalmente:** ocultaba la notificación para TODOS los usuarios cambiando la columna global. Corrección: usar la tabla `lecturas` con `hidden_at` por usuario; nunca tocar `center`.

**Bug 5 — read-all y clear contaban mal y no usaban correctamente la audiencia:** `read-all` contaba todas las notifs de la audiencia incluyendo ya leídas; `clear` modificaba `center=0` globalmente. Corrección: ambas operaciones filtran solo las que realmente cambian (no leídas / no ocultas), se ejecutan en `db.transaction()` y retornan el conteo real de filas modificadas.

**Regla de audiencia centralizada:** la condición `center = 1 AND (broadcast = 1 OR rol en destinatarios OR correo en destinatarios)` se extrae en la función `assertInAudience` y se replica consistentemente en todas las queries para garantizar coherencia entre listado, contador, lectura y ocultamiento.

**Aislamiento:** todas las operaciones de lectura/ocultamiento operan sobre el par `(notification_id, user_email)` en la tabla `lecturas`. Ninguna operación modifica datos globales de la notificación ni afecta a otros usuarios.



- El router se monta en `/agencias` desde `server.ts`. Internamente se usa un subrouter con `mergeParams: true` para capturar `/:agencia/asesores` y que el parámetro `:agencia` esté disponible en todas las rutas hijas.
- Un middleware central valida agencia (existencia y no eliminada → 404), luego permisos (analista → 403, asesor de otra agencia → 403) antes de cualquier ruta.
- Normalización: `normalizeCorreo` hace trim + lowercase + regex básico `local@dominio.sufijo`; `normalizeTelefono` retiene solo dígitos y `+` inicial; `normalizeNombre` hace trim y valida no vacío y longitud.
- Toda escritura (POST, PATCH, DELETE, PATCH restaurar) corre dentro de `db.transaction()` para atomicidad: si falla la inserción del evento, se revierte el cambio al contacto.
- Baja y restauración son idempotentes: si el contacto ya está en el estado destino, retorna el contacto sin insertar evento.
- Coincidencias: se buscan otros contactos activos de la misma agencia con igual correo **o** teléfono normalizado, excluyendo el propio ID. Se deduplican en caso de que coincidan por ambos campos.
- Historial: devuelve todos los eventos del contacto (incluso si está eliminado), con `anterior`/`nuevo` deserializados como objetos JSON.



## Defectos corregidos

Para cada regresión relevante, describe petición de entrada, resultado anterior, resultado esperado y causa.

## Pruebas propias

Indica archivo/nombre de prueba, escenario, fallo que detecta y resultado. Incluye comandos ejecutados.

## Limitaciones y siguiente mejora

Describe lo que no alcanzaste a resolver y cómo continuarías. No ocultes fallos conocidos.

## Cambio durante la demostración

Completar al final: requisito recibido, archivos modificados, pruebas y resultado.
