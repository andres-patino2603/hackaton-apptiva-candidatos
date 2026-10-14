# Decisiones y comprobaciones de mi entrega

Nombre o identificador del participante: Meriyei Manosalva

## Estado de cada caso

| Caso | Completo/parcial | Comprobaciones | Pendiente |
|---|---|---|---|
| Historial SQL | Completo | Ejemplo público verde; tests propios `pagos.test.ts` (3): paginación+filtros, relaciones null, permisos/validación. Verificación manual: montos id1=12500, id2=12100, id3=20500, id5=PAGO/0, orden 6,5,3,2,1,7, id4 excluido | Nada |
| Ciudades | Completo | Ejemplo público verde; tests propios `ciudades.test.ts` (4): AND de filtros, country subcadena, fin de catálogo, orden+límite | Nada |
| Directorio | Completo | Ejemplo público verde; tests propios `contactos.test.ts` (4): 403/404, restaurar idempotente, búsqueda literal %, auditoría anterior/nuevo | Nada |
| Notificaciones | Completo | Ejemplo público verde; tests propios `notificaciones.test.ts` (4): aislamiento, idempotencia, read-all+restart, 404 | Nada |
| Endpoint de actividades | Completo | Ejemplo público verde; tests propios `actividades.test.ts` (4): 400 sin escrituras, actividad+tarea+eventos, permisos, persistencia | Nada |

Suite completa: `npm test` → 25/25 verdes (6 archivos). `npm run typecheck` → 0 errores.

## Qué resolví en cada caso (explicación)

### Caso 1 — Historial de pagos

Administración necesita ver pagos: quién pagó, de qué crédito, cuánto, cuándo. Los dos SQL estaban vacíos y devolvían siempre cero filas. Armé dos consultas: una lista los pagos página por página, otra cuenta el total de coincidencias para saber cuántas páginas hay.

Lo complicado:

1. **Pagos sin cliente ni crédito.** El pago ID 5 no tiene persona ni crédito. No se descarta — se muestra con esos campos vacíos (null).  Por eso el LEFT JOIN: trae la info del cliente si existe, pero no exigue
2. **El monto puede estar mal en la BD.** A veces `valor_total` tiene valor registrado; a veces está vacío o en cero. Regla: si el registrado es distinto de cero, se usa. Si no, se suman las 6 columnas de componentes (capital, interés, aval, mora, cobranza, abono extra). Ejemplo: el pago 2 tiene `valor_total` vacío, sus componentes suman 12100 — ese es el monto correcto.
3. **La operación puede estar vacía.** Si no dice si fue "PAGO" o "ABONO", se muestra "PAGO" por defecto.
4. **Orden estable.** Los pagos 2 y 3 tienen la misma fecha. Si solo ordeno por fecha, su posición cambia entre páginas y el usuario vería filas repetidas o perdidas. Por eso ID descendente como desempate.
5. **Total antes de paginar.** Filtrando por "DOC-A" con límite 2, necesito saber que hay 3 en total (para decir "página 1 de 2") aunque solo muestre 2.

Resultado: `/pagos/historial?cedula_cliente=DOC-A` devuelve pagos 2, 1 y 7 ordenados, total 3; al paginar no se pierde ni se repite nada.

### Caso 2 — Buscador de ciudades

Catálogo de 26 ciudades. El usuario escribe y debe encontrar por nombre, país o código de país. El código tenía 4 errores:

1. **Cortaba la lista antes de buscar.** Tomaba las primeras 20 ciudades y DESPUÉS filtraba. Como "Última" es la número 26, nunca aparecía. Arreglo: filtrar primero, cortar después.
2. **Los dos filtros se ignoraban entre sí.** El buscador tiene dos campos: texto libre (`q`) y país (`country`). Deben cumplirse LOS DOS a la vez. Con el código viejo, si el campo país estaba vacío, el filtro de país se desactivaba y el texto pasaba solo. Ejemplo con el bug: `?q=villa&country=BO` — "Villa 01" es de "País Ámbar" (AM), no de "País Boreal" (BO), así que la respuesta correcta es lista vacía `[]`. Pero el código devolvía 20 ciudades (todas las Villas), porque el país "BO" se ignoraba mientras el texto "villa" coincidiera con algo.
3. **No entendía tildes ni mayúsculas.** "LÚMINA" no encontraba "Lúmina". Arreglo: normalizar (quitar tildes, minúsculas) tanto la entrada como los datos.
4. **El filtro de país solo funcionaba con código exacto.** "bo" funcionaba, "boreal" no. Arreglo: buscar en nombre del país Y código.

### Caso 3 — Directorio de asesores

Cada agencia tiene contactos con nombre, correo y teléfono. Hay que listar, crear, editar, bajar y restaurar. El archivo solo devolvía 501.

1. **Permisos.** asesor-a solo administra agencia 1; asesor-b solo la 2. Admin puede con las dos activas. Agencia 3 archivada = nadie entra. asesor-b en agencia 1 → 403. Agencia 99 → 404.
2. **Normalizar entradas.** Nombre: se limpia de espacios. Correo: minúsculas + forma válida (algo@algo.com); vacío se guarda vacío. Teléfono: se quitan paréntesis, espacios y guiones — quedan dígitos y el `+` inicial. "+57 (300) 123-4567" → "+573001234567".
3. **Aviso de coincidencias.** Si el correo o teléfono ya existe en otro contacto activo de la MISMA agencia, la respuesta incluye el aviso. No impide guardar — es para que el asesor vea duplicados. En edición se excluye al propio contacto.
4. **Baja lógica.** Borrar NO borra: se marca como eliminado (fecha + quién). Se conserva historial. Borrar dos veces = sin cambios ni eventos nuevos.
5. **Restaurar.** Recupera el contacto con el mismo ID. Restaurar dos veces = sin cambios.
6. **Auditoría.** Cada acción deja evento: qué pasó, quién, cómo estaba ANTES y cómo quedó DESPUÉS. Escritura + evento en la misma transacción — o entran los dos o no entra ninguno.

### Caso 4 — Notificaciones

hay un centro de avisos. Cada usuario ve avisos generales (broadcast), avisos de su rol, y avisos personales suyos. El módulo estaba escrito con errores que mezclaban datos entre usuarios.

1. **El contador no contaba bien.** Sí edías 1 notificación con limit=1 y te decía "sin leer: 1", cuando en realidad tenía 4 sin leer. El código contaba solo las que cabían en la página en vez de contar todas las que tiene el usuario.
2. **Las lecturas se filtraban entre usuarios.**  Si "asesor-a" leía un aviso, "admin" abría su panel y veía ese aviso como leído — aunque él nunca lo había tocado. Causa: la consulta no distinguía QUIÉN leyó. Cada usuario debe tener su propia marca de lectura.
3. **Marcar leído dos veces cambiaba la fecha.** Doble clic sobrescribía la fecha real de lectura. Arreglo: si ya tiene fecha, no se toca. Segunda vez = misma respuesta.
4. **"Ocultar" borraba el aviso para TODOS.** Ocultar marcaba el aviso global como fuera del centro. Arreglo: ocultamiento personal por correo. Admin oculta n3 → solo admin deja de verla.
5. **"Marcar todo" contaba mentiras.** Decía "actualizados: 6" aunque ya estuvieran leídos. Arreglo: contar solo cambios reales. Segunda vez = 0.
6. **"Limpiar todo" igual pero peor.** Contaba mal Y usaba el borrado global. Arreglo: ocultar solo los del usuario, en transacción, contando cambios reales.
7. **Bug propio detectado por mi test.** El contador seguía contando avisos ya leídos en un caso real. Faltaba el filtro `read_at IS NULL`. Corregido.

Idea central: una sola función SQL define "qué avisos ve este usuario". Listado, contador, marcar-todo y limpiar-todo usan esa MISMA función — si cambia la regla, se cambia en un solo lugar.

### Caso 5 — Actividades del CRM

Un asesor registra cada gestión sobre un prospecto (llamada, correo, reunión) y puede dejar una próxima tarea. El endpoint no existía: se construyó entero.

1. **¿Quién eres?** `x-user` identifica el rol, es decir, x-user dice si eres admin, asesor-a, asesor-b o analista. Sin header o header inventado = 401.
2. **¿Puedes tocar ese prospecto?** El admin puede con cualquiera. El asesor solo con los suyos (r1 es de asesor-a, r2 de asesor-b). Si el prospecto está archivado (r3) = 404. Si no tiene dueño (r4) solo el admin puede registrar algo — un asesor recibe 403.
3. **¿El cuerpo está bien?** 
- tipo: solo llamada, correo o reunión.
- resultado: solo "contactado" o "sin_respuesta".
- detalle: texto libre, no vacío, máximo 5000 caracteres.
- fecha: opcional. Si no la mandas, se usa "ahora". Si la mandas, tiene que ser una fecha real y no futura.
- proxima_accion + vence_at: van juntos o no van. Si mandas uno sin el otro = 400 y no se guarda nada.
4. **Todo de una vez (transacción).** Estas operaciones van en un paquete:
insertar la actividad (la gestión realizada), insertar el evento "actividad" en el historial del prospecto, si hay próxima acción: insertar la tarea Y su evento "tarea_creada", es decir: Actividad → evento `actividad` → (si hay próxima) tarea → evento `tarea_creada`. Si algo falla, se revierte TODO — no queda media operación.
5. **Respuesta 201** con la actividad y, si la hubo, la tarea (responsable = el del prospecto; si no tiene, el actor).

## Decisiones de diseño

**Pagos.** LEFT JOIN conserva pagos sin relaciones. Filtros con patrón `(? IS NULL OR col >= ?)` para no ramificar SQL. `operacion` con `COALESCE(NULLIF(TRIM(...),''),'PAGO')`. `valor_total` por CASE. Total con `COUNT(*)` separado. Orden estable `fecha_pago DESC, id_pago DESC`.

**Ciudades.** Normalización NFD + strip diacríticos + lowercase. AND de filtros. Filtrar antes de `slice(0,20)`. Sin mutar el array.

**Directorio.** `resolveAgencia` valida 400 → 404 → 403 en orden. Búsqueda con `instr(lower(...))` (literal, `%`/`_` no comodines). Escritura + evento en transacción. Baja/restaurar chequean estado previo para idempotencia. `coincidencias` con OR en una query, excluye propio ID en edición.

**Notificaciones.** Audiencia centralizada en `FROM_AUDIENCIA` (compartido por listado, contador, read-all, clear). JOIN exige `user_email` — estado por par (notificación, usuario). Ocultar escribe `hidden_at` personal, no `center=0`. Contador y `updated` miden cambios reales. Todo en transacción; `save()` tras COMMIT da persistencia tras reinicio.

**Actividades CRM.** Auth → permisos por `responsable_id` → validación → transacción completa. Rollback: excepción dentro de `db.transaction` revierte actividad, tarea y eventos (probado por test 400 + resumen vacío).

## Defectos corregidos

**Caso 1 — SQL vacía.** `/pagos/historial?cedula_cliente=DOC-A` → total 0, items []. Esperado total 3, ids [2,1,7]. Causa: consultas placeholder sin implementar.

**Caso 2 — 4 regresiones.**
1. `slice(0,20)` antes de `filter` → `q=ultima` devolvía []. Esperado [city-26].
2. `||` en vez de `&&` → `q=villa&country=BO` devolvía 20 Villas (de AM). Esperado [].
3. Sin normalización → `q=LÚMINA` devolvía 20. Esperado [city-1].
4. `country` solo comparaba `countryCode` exacto → `country=boreal` no encontraba nada. Esperado subcadena.

**Caso 3 — 501.** Todo el directorio devolvía 501. Implementadas las 6 rutas.

**Caso 4 — 6 fallos + 1 propio.**
1. `unreadCount = items.length` → con `limit=1` devolvía 1. Esperado 4.
2. JOIN sin `user_email` → si A leía n3, B veía `readAt` ajeno. Esperado `null` para B.
3. `INSERT OR REPLACE` pisaba la primera fecha de lectura.
4. `DELETE` con `center=0` ocultaba para TODOS. Esperado: solo para el actor.
5. `clear` contaba toda la audiencia y usaba `center=0`.
6. `read-all` contaba toda la audiencia, no solo no-leídos.
7. (Propio) `unreadCount` sin `AND l.read_at IS NULL` contaba leídos. Detectado por test de persistencia y corregido.

**Caso 5 — 404.** Router vacío. Implementado endpoint completo.

## Pruebas propias

| Archivo | Escenario | Fallo que detecta | Comando |
|---|---|---|---|
| `ciudades.test.ts` | AND de filtros, country substring, fin de catálogo, orden | Regresiones 1-4 del caso 2 | `npm test` |
| `pagos.test.ts` | Paginación con filtros, relaciones null, 400/401/403 | SQL placeholder, JOIN inner, validación ausente | `npm test` |
| `contactos.test.ts` | 403/404, restaurar idempotente, búsqueda literal %, auditoría | 501, eventos duplicados, LIKE con comodines, sin auditoría | `npm test` |
| `notificaciones.test.ts` | Aislamiento, idempotencia read/clear, restart, 404 | Contador por limit, ocultamiento global, no persistencia | `npm test` |
| `actividades.test.ts` | 400 sin escrituras, actividad+tarea+eventos, permisos, restart | Endpoint 404, sin transacción, permisos rotos | `npm test` |

Resultado: 25/25 verdes. Cada test usa servidor y SQLite temporales propios vía `httpLab()`.

## Limitaciones y siguiente mejora

- Sin paginación por cursor en `/pagos/historial`; solo offset `page`/`limit` según contrato. Siguiente mejora: param `cursor` + header `X-Next-Cursor` con keyset sobre `(fecha_pago, id_pago)`.
- Sin frontend. La API se probó por HTTP y tests; SPA React+Vite sería mejora visual, fuera del alcance evaluado.
- Búsqueda del directorio no es insensible a tildes (no lo exige el contrato). Si se pidiera, reutilizar la normalización NFD del caso 2.
- `coincidencias` sin orden garantizado (no lo exige el contrato).
- La defensa incluirá un cambio de contrato en vivo; quedará documentado al final de este archivo.

## Cambio durante la demostración

Pendiente: se completará al recibir el requisito en la defensa (requisito recibido, archivos modificados, pruebas y resultado).
