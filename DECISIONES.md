# Decisiones y comprobaciones de mi entrega

Nombre o identificador del participante: [escribe aquí tu nombre]

## Estado de cada caso

| Caso | Completo/parcial | Comprobaciones | Pendiente |
|---|---|---|---|
| Historial SQL | Completo | Ejemplo público «filtra historial por cliente y devuelve el total»; propia «pagos: paginación y relaciones opcionales» | Probar más combinaciones de filtros y fechas límite |
| Ciudades | Completo | Ejemplo público «encuentra una ciudad ignorando tildes»; propia «ciudades: los filtros q y country se combinan con AND» | Probar mayúsculas y `País Ámbar` sin tildes |
| Directorio | Completo | Ejemplo público «permite crear un contacto de mi agencia»; propia «directorio: permiso denegado y agencia eliminada» | Pruebas de normalización, coincidencias, baja/restauración idempotentes, `search` literal e historial |
| Notificaciones | Completo | Ejemplo público «el contador de notificaciones no depende de limit»; propia «notificaciones: clear es idempotente e aislado por usuario» | Pruebas de `read-all` repetido, lectura aislada por usuario y 404 sin efectos |
| Endpoint de actividades | Completo | Ejemplo público «crea una actividad comercial mediante el nuevo endpoint»; propia «actividades: próxima acción sin fecha devuelve 400 sin efectos» | Pruebas de fechas imposibles/futuras, `null` frente a ausente, 403/404 y orden de eventos |

## Decisiones de diseño

### Caso 1: relaciones SQL y nulos
- **`LEFT JOIN` con `clientes` y `creditos`.** El pago 5 no tiene cliente ni crédito y el contrato exige conservarlo. Un `INNER JOIN` lo descartaría. Sus campos relacionados salen como `null`.
- **Filtros opcionales con `(? IS NULL OR columna = ?)`.** Un solo SQL sirve para todas las combinaciones. Los valores se pasan siempre como parámetros posicionales (cada filtro dos veces) y nunca se concatenan, así no hay inyección SQL.
- **Total en una consulta aparte, sin `LIMIT`.** Usa los mismos ocho filtros que el listado. `COUNT(*)` sin `GROUP BY` siempre devuelve una fila, incluso con cero coincidencias.
- **Orden `fecha_pago DESC, id_pago DESC`.** El desempate por ID evita que se repitan o se salten filas entre páginas.
- **`valor_total`.** Si el valor registrado es distinto de cero y no nulo, tiene prioridad. En otro caso se suman los seis componentes, cada uno con `COALESCE(x, 0)`, porque en SQL `NULL + 5` es `NULL`.
- **`operacion`.** `COALESCE(NULLIF(operacion, ''), 'PAGO')` cubre tanto nulo como vacío.
- **Fechas como texto `YYYY-MM-DD`.** Ordenan igual como texto que como fecha, así que `>=` y `<=` son inclusivos.

### Caso 2: normalización
- Una sola función `normalize()` (`NFD`, eliminar marcas `\p{M}` con la bandera `u`, minúsculas) que se aplica a ambos lados: al texto buscado y a cada campo del catálogo.
- Se filtra primero y después se limita a 20.
- `q` busca por subcadena en `ascii`, `country` y `countryCode`; `country` busca en `country` y `countryCode`. Si vienen ambos se cumplen ambos (AND). Vacío o ausente desactiva el filtro.
- `filter` y `slice` no mutan el catálogo.

### Caso 3: permisos y reglas compartidas
- **Una sola función `cargarAgencia`** valida el ID (entero 1..1000000, si no 400), el rol (analista 403), la existencia de la agencia (inexistente o eliminada 404) y la propiedad del asesor (agencia ajena 403). Todas las rutas la llaman, así no se puede olvidar el control en una sola.
- **Orden de comprobaciones.** Rol antes que existencia: un analista recibe 403 aunque la agencia no exista. Un asesor sobre una agencia inexistente recibe 404.
- **Todo acotado por agencia.** Los contactos se buscan con `WHERE id = ? AND id_agencia = ?`, de modo que un contacto de otra agencia da 404 incluso para admin.
- **`normalizarContacto()` compartida por POST y PATCH.** Recorta nombre, pasa el correo a minúsculas y valida su forma, deja en el teléfono solo dígitos y un `+` inicial, y convierte los vacíos opcionales en `null`.
- **Coincidencias.** Una sola consulta con `OR` sobre contactos activos de la misma agencia, excluyendo el propio ID. Cada campo solo se compara si no es `null`, porque `NULL = NULL` no es verdadero en SQL.
- **Baja y restauración idempotentes.** Se lee el estado antes de escribir; si no hay cambio real no se hace `UPDATE` ni se registra evento.
- **Listado.** `ORDER BY nombre_completo COLLATE NOCASE, id`. El `search` usa `instr(lower(campo), lower(?))` y no `LIKE`, para que `%` y `_` sean literales. Los filtros se aplican en el `WHERE` antes de paginar y de contar el total.
- **IDs** con `crypto.randomUUID()`; nunca vienen del cliente.

### Caso 4: audiencia y visibilidad
- Dos conceptos separados, escritos una sola vez como fragmentos SQL reutilizados (`AUDIENCIA`, `OCULTA`, `VISIBLE`): **audiencia** (el aviso es para el usuario) y **visible** (en la audiencia y no oculto por él).
- Las operaciones individuales usan la audiencia, porque las ocultas propias admiten lectura y ocultamiento repetidos. El listado, el contador y las operaciones masivas usan lo visible.
- Lectura y ocultamiento son por usuario: se guardan en `lecturas` y nunca se toca `notificaciones.center`.
- **Lectura:** crea la fila solo si no existe, así conserva la primera fecha de lectura y no revierte un ocultamiento.
- **Ocultar:** marca `hidden_at` solo para el actor, pone `read_at` si no existía y conserva la primera fecha de ocultamiento.
- **`read-all` y `clear`:** `updated` cuenta solo los avisos visibles que realmente cambiaron, por lo que una segunda llamada da 0.
- `unreadCount` es su propio `COUNT` con la regla de visibilidad y sin `LIMIT`.
- Las operaciones individuales responden 404 si el aviso no está en la audiencia, tiene `center=0` o no existe, sin escribir nada.

### Caso 5: orden de comprobaciones y validación
- **Orden:** identidad (401), rol (analista 403), registro (inexistente o eliminado 404), propiedad (asesor ajeno o registro sin responsable 403), validación del body (400) y transacción. Se validan los permisos antes que los datos para no analizar el cuerpo de quien no puede usar el endpoint.
- **Validación completa antes de abrir la transacción**, así un 400 nunca escribe nada.
- **Ausente frente a `null`.** Se distingue con `hasOwnProperty`: ausente se acepta, `null` es inválido.
- **Timestamps canónicos.** Se valida el formato con una regex y se comprueba que `new Date(s).toISOString() === s`, lo que rechaza fechas imposibles como `2025-02-30`. `fecha` además no puede ser futura.
- **`proxima_accion` y `vence_at`** deben venir juntos; si falta uno, 400.
- **Seguridad.** `actor_id`, `responsable_id` y los IDs nunca se leen del body. El actor sale de la identidad y el responsable de la tarea es el del registro (o el actor si es `null`).

### Transacciones (atomicidad del caso 5)
La actividad, su evento `actividad` y, si hay próxima acción, la tarea y su evento `tarea_creada` se escriben en un solo `db.transaction`, y los eventos quedan en ese orden. Si cualquier inserción falla, `db.transaction` hace `ROLLBACK` y no queda nada guardado: no puede existir una actividad sin su evento ni una tarea sin su actividad. Los casos 3 y 4 usan transacción por la misma razón (cada cambio y su evento de historial, o cada operación masiva, se confirman juntos o no se confirman).

## Defectos corregidos

### Caso 2 (ciudades)

| Petición | Resultado anterior | Resultado esperado | Causa |
|---|---|---|---|
| `/cities?q=%C3%BAltima&country=bo` | `city-26` nunca aparecía | Solo `city-26` | `slice(0, 20)` antes de `filter`: solo miraba las 20 primeras ciudades |
| `/cities?q=lumina&country=bo` | Podía devolver ciudades que cumplían solo uno de los filtros | `[]` | `\|\|` entre los dos filtros en lugar de AND |
| `/cities?q=LUMINA` (o con tildes) | No encontraba `Lumina` | Misma respuesta que `lumina` | `includes` sin normalizar distingue mayúsculas y diacríticos |
| `/cities?country=bo` y `q` sobre `country` | `country` se comparaba con `===` solo contra `countryCode`; `q` solo miraba `ascii` | Subcadena en `country` y `countryCode`; `q` en `ascii`, `country` y `countryCode` | Campos y operador de comparación incorrectos |

### Caso 4 (notificaciones)

| Petición | Resultado anterior | Resultado esperado | Causa |
|---|---|---|---|
| `GET /notifications` | La lectura u ocultamiento de otro usuario aparecía en mi lista | Solo cuentan mis propias lecturas | El `LEFT JOIN` con `lecturas` no filtraba por `user_email` |
| `GET /notifications?limit=1` | `unreadCount` valía como máximo 1 | Total de no leídos visibles | Se contaba sobre la lista ya limitada |
| `GET /notifications` con fechas iguales | Orden inestable | `createdAt DESC, id DESC` | Faltaba el desempate por ID |
| `PATCH /:id/read` repetido | Se pisaba la primera fecha de lectura y se borraba el ocultamiento | Conserva la primera fecha y no revierte el ocultamiento | `INSERT OR REPLACE` reemplaza la fila completa |
| `DELETE /:id` y `POST /clear` | El aviso desaparecía para **todos** los usuarios | Se oculta solo para el actor | Hacían `UPDATE notificaciones SET center=0` |
| `POST /read-all` (dos veces) | `updated` contaba todo lo consultado, incluso lo ya leído | Solo lo que pasó de no leído a leído; la segunda llamada da 0 | Se devolvía el tamaño de la audiencia, sin excluir leídos ni ocultos |
| `PATCH` o `DELETE` sobre un aviso ajeno, inexistente o con `center=0` | Respondía 200 | 404 sin efectos | No se comprobaba la audiencia en las operaciones individuales |
| Cualquier ruta | La condición de audiencia estaba copiada tres veces | Una sola definición | Reglas repetidas; ahora son los fragmentos `AUDIENCIA`, `OCULTA` y `VISIBLE` |

## Pruebas propias

Archivo: `tests-publicos/propias.test.ts`.

| Prueba | Escenario | Fallo que detecta | Resultado |
|---|---|---|---|
| pagos: paginación y relaciones opcionales | `limit=2` en páginas 1 y 2; pago 5 sin cliente ni crédito | `INNER JOIN` que pierde el pago 5, paginación inestable, falta de `PAGO` por defecto | Pasa |
| directorio: permiso denegado y agencia eliminada | Asesor de otra agencia, analista y agencia 3 | Permisos mal ordenados o ausentes | Pasa |
| notificaciones: clear es idempotente e aislado por usuario | `clear` de `asesor-a` dos veces; luego listado de `asesor-b` | Ocultar para todos, conteo incorrecto, `clear` no idempotente | Pasa |
| actividades: próxima acción sin fecha devuelve 400 sin efectos | `proxima_accion` sin `vence_at`; luego `GET .../resumen` | Escrituras parciales ante un 400 | Pasa |
| ciudades: los filtros q y country se combinan con AND | `q=lumina&country=bo` y `q=%C3%BAltima&country=bo` | `OR` entre filtros, filtrado después de limitar | Pasa |

Comandos ejecutados:

```
npm ci
npm run typecheck
npm test
```

Resultado de `npm test`: 2 archivos, 11 tests (6 ejemplos públicos y 5 propios), todos aprobados. `npm run typecheck` termina sin errores.

## Limitaciones y siguiente mejora

- **Cobertura de pruebas propias limitada.** Cada caso tiene un solo test propio y varios escenarios del contrato no están cubiertos por tests automáticos: normalización de correo y teléfono, coincidencias, baja y restauración idempotentes, `search` literal e historial (caso 3); `read-all` repetido y lectura aislada por usuario (caso 4); creación válida con tarea y orden de eventos, fechas imposibles o futuras, `null` frente a ausente y los 403/404 (caso 5). Mi siguiente paso sería escribirlos.
- **`created_at` de los eventos del caso 5.** Los eventos de `crm_historial` usan el mismo timestamp que la actividad, que es la `fecha` informada si el cliente la envía (puede ser pasada). El contrato no especifica este punto. Una mejora sería registrar los eventos con la hora real de escritura y dejar `fecha` solo en la actividad.
- **Lectura previa a la transacción.** En `read-all`, `clear` y en las rutas de contactos leo el estado antes de abrir la transacción. Con un único proceso síncrono no puede intercalarse otra petición, así que es seguro hoy, pero lo más robusto sería leer y escribir dentro de la misma transacción.
- **Un solo proceso.** El motor está pensado para un único servidor por archivo SQLite; no probé varios procesos concurrentes sobre la misma base.

## Cambio durante la demostración

Pendiente: se completa al final de la jornada (requisito recibido, archivos modificados, pruebas y resultado).
