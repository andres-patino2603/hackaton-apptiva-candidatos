# Contrato público del laboratorio

Todas las respuestas son JSON. Los errores devuelven `{"error":"texto"}`; no se compara el texto exacto. Los cuerpos válidos son objetos JSON. Los timestamps son ISO 8601 UTC. Los IDs nuevos son cadenas únicas y no tienen un formato obligatorio. Campos no reconocidos del cuerpo pueden ignorarse; solo se escriben los campos descritos aquí.

## Identidad y validaciones comunes

Solo `/cities` y `/health` son públicos. En las demás rutas envía `x-user`:

| Valor | Rol | Correo ficticio |
|---|---|---|
| admin | admin | admin@example.test |
| asesor-a | asesor | a@example.test |
| asesor-b | asesor | b@example.test |
| analista | analista | analista@example.test |

La infraestructura elimina espacios exteriores y convierte el header a minúsculas. Usuario ausente/desconocido: **401**. No implementes Supabase ni JWT. Los parámetros de consulta deben ser textos únicos; repetidos o estructurados devuelven **400**. Los enteros no admiten decimales ni fragmentos SQL. Errores de validación no deben modificar datos.

## 1. GET /pagos/historial

Acceso: admin o analista. Un asesor recibe **403**; identidad ausente/desconocida, **401**. La ruta, validación y formato envolvente están implementados; completa las dos consultas SQL.

Filtros opcionales: `fecha_inicio` y `fecha_fin` como fechas de calendario válidas `YYYY-MM-DD`, inclusivas; `cedula_cliente` e `id_credito` como coincidencias exactas, no vacíos. Combinar todos con AND. Rango invertido, fecha imposible, parámetros repetidos o estructurados: **400**. Las fechas del laboratorio no tienen hora. `page` entero 1..1000000, defecto 1; `limit` entero 1..100, defecto 20. Fuera del rango o no entero: **400**.

Respuesta **200**: `{items,total,page,limit,totalPages}`. Excluir pagos con `deleted_at` no nulo. Orden `fecha_pago DESC,id_pago DESC`. Calcular `total` con todos los filtros antes de paginar. `totalPages = max(1,ceil(total/limit))`. Una página fuera de rango devuelve items vacío y conserva total; cero coincidencias devuelve total 0 y totalPages 1.

Cada item contiene exactamente `{id_pago,fecha_pago,id_credito,cedula_cliente,nombre_cliente,estado_credito,metodo_pago,operacion,valor_total}`. Obtener `nombre_cliente` de `clientes` y `estado_credito` de `creditos`; conservar pagos sin esas relaciones, devolviendo los campos relacionados como null. Los IDs de relación de esos pagos también son null.

`operacion` nula o vacía se devuelve como `PAGO`. `valor_total` registrado distinto de cero tiene prioridad; si es nulo o cero, sumar `capital`, `interes`, `aval`, `mora`, `cobranza` y `abono_extra`, tratando null como cero. Todos los importes son números enteros en unidades monetarias ficticias: no se requiere redondeo ni conversión de moneda.

SQL: `01-pagos.sql` recibe `[fecha_inicio,fecha_inicio,fecha_fin,fecha_fin,cedula_cliente,cedula_cliente,id_credito,id_credito,limit,offset]`; filtro ausente se envía como null. `offset=(page-1)*limit`. `01-pagos-total.sql` recibe los primeros ocho parámetros y debe devolver una única fila `{total}` incluso si no hay coincidencias. Resolver relaciones, filtros, orden, paginación, operaciones y monto en SQL parametrizado; no hardcodear los resultados del seed.

Datos públicos: hay seis pagos activos (IDs 1,2,3,5,6,7) y uno eliminado (4). El ID 5 no tiene cliente ni crédito; IDs 2 y 3 requieren sumar componentes; ID 1 tiene total registrado distinto de la suma. Consulta `src/seed.sql` para fechas y valores.

Ejemplo: `/pagos/historial?cedula_cliente=DOC-A&limit=2` devuelve IDs `[2,1]`, total 3, page 1, limit 2 y totalPages 2.

## 2. GET /cities

Filtros opcionales `q` y `country`. Ambos ignoran mayúsculas y diacríticos mediante normalización Unicode NFD. No se exige eliminar espacios de la búsqueda. Ausente o cadena vacía desactiva el filtro.

`q` coincide por subcadena con `ascii`, `country` o `countryCode`. `country` coincide por subcadena con `country` o `countryCode`. Si hay ambos, deben cumplirse ambos filtros. Filtra antes de limitar a veinte. Preserva el orden del catálogo. Respuesta **200**, array de objetos originales `{id,ascii,city,country,countryCode}`. No alteres el catálogo.

Ejemplo: `/cities?q=%C3%BAltima&country=bo` devuelve únicamente `city-26`. `/cities?q=lumina&country=bo` devuelve `[]`.

## 3. /agencias/:agencia/asesores

Agencia 1 pertenece a `asesor-a`, 2 a `asesor-b`; 3 está eliminada. Todas las rutas admiten admin o asesor propietario. Analista o asesor de otra agencia: **403**. Agencia inexistente/eliminada: **404**. El ID de agencia es entero positivo hasta 1000000. Un contacto ajeno a la agencia de la URL es **404**, incluso para admin.

Un contacto tiene `{id,id_agencia,nombre_completo,correo,telefono,deleted_at,deleted_by,created_by,updated_by}`. La baja no borra el registro. `created_by` y `updated_by` son IDs de los usuarios del laboratorio.

| Método y sufijo | Comportamiento y respuesta |
|---|---|
| GET (sin sufijo) | **200**, `{items,total,page,limit}`. `page` por defecto 1, rango 1..1000000; `limit` por defecto 20, rango 1..100; `vista=activos` por defecto o `eliminados`; `search` opcional hasta 150 caracteres. |
| POST (sin sufijo) | **201**, `{item,coincidencias}` con el contacto creado. |
| PATCH /:id | **200**, `{item,coincidencias}`. Reemplaza nombre/correo/teléfono de un contacto activo. No es un PATCH parcial: requiere nombre; opcionales ausentes se convierten en null. |
| DELETE /:id | **200**, contacto completo. Fija `deleted_at`, `deleted_by` y `updated_by`. Repetir una baja no cambia datos ni agrega eventos. |
| PATCH /:id/restaurar | **200**, contacto completo. Limpia `deleted_at` y `deleted_by`, conserva ID, fija `updated_by`. Repetir restauración no agrega eventos. |
| GET /:id/historial | **200**, array de eventos del contacto, incluidos los eliminados; más reciente primero. |

Listado: orden por `nombre_completo` sin distinción ASCII de mayúsculas, luego ID ascendente. `search` es subcadena literal de nombre/correo ignorando mayúsculas ASCII o de teléfono. `%` y `_` son literales; no se exige insensibilidad a tildes en este caso. Aplica todos los filtros antes de paginar y calcular `total`; una página vacía conserva el total.

Cuerpo de POST/PATCH: `nombre_completo` texto obligatorio, máximo 150 caracteres antes de trim, no vacío tras trim. `correo` opcional/null/texto, máximo 255; elimina espacios externos, convierte a minúsculas y, si no queda vacío, requiere forma básica `local@dominio.sufijo`, sin espacios. `telefono` opcional/null/texto, máximo 30; quita todo salvo dígitos y `+`, y elimina `+` que no esté al comienzo. Valores opcionales vacíos tras normalización quedan null. Otros tipos, longitudes excedidas o datos inválidos: **400**.

`coincidencias`: array de `{id,nombre_completo}` de otros contactos activos de la misma agencia con el mismo correo **o** teléfono normalizado, excluyendo el propio ID en edición. Null no coincide. Si coincide por ambos campos aparece una vez. La advertencia no impide guardar. No se exige orden del array.

Auditoría: al crear/editar/dar baja/restaurar, guarda atómicamente un evento `{id,contacto_id,accion,actor_id,anterior,nuevo,created_at}`; acciones `creacion`, `actualizacion`, `baja`, `restauracion`. `anterior` es null al crear y un objeto con el contacto previo en otras acciones; `nuevo` es el contacto completo posterior. Eventos ordenados por creación descendente, desempate por ID secuencial descendente. Las semillas no contienen eventos. Una edición válida registra evento aunque sus valores coincidan. Una edición de contacto eliminado devuelve **404**.

## 4. /notifications

Una notificación pertenece a un usuario si `broadcast=1`, coincide su rol en destinatarios **o** coincide su correo. Solo `center=1` participa. Varias coincidencias no duplican el aviso. El rol admin está sembrado como destinatario; no es un permiso para omitir `center`.

Lectura y ocultamiento pertenecen al par notificación/usuario. Nunca cambian el aviso global ni el estado de otro usuario. Una notificación oculta deja de aparecer y de contarse para ese usuario. Operaciones individuales sobre notificaciones fuera de su audiencia, con `center=0` o inexistentes: **404** sin efectos. Las ocultas propias admiten lectura/ocultamiento repetidos.

| Ruta | Respuesta **200** |
|---|---|
| GET /notifications | `{items,unreadCount}`. Cada item: `{id,title,createdAt,readAt}`. `readAt=null` cuando no se ha leído. Orden `createdAt DESC,id DESC`. |
| PATCH /notifications/:id/read | `{id,readAt}`. Crea la primera fecha de lectura; repeticiones conservan esa fecha y no revierten el ocultamiento. |
| DELETE /notifications/:id | `{id,hiddenAt}`. Oculta solo para el actor y marca leído si no existía lectura. Conserva fecha de lectura previa. Repeticiones conservan la primera fecha de ocultamiento. |
| POST /notifications/read-all | `{updated}` con número de avisos visibles que pasaron de no leídos a leídos; no incluye ocultos. Segunda llamada sin cambios: cero. |
| POST /notifications/clear | `{updated}` con número de avisos visibles que se ocultaron. Segunda llamada sin cambios: cero. |

`limit` de listado: entero, por defecto 50, se acota a 1..100 (0 y negativos equivalen a 1; mayor a 100 equivale a 100). Formatos no enteros: **400**. `unreadCount` cuenta toda la audiencia visible no leída, independientemente del límite. Las operaciones masivas también afectan toda la audiencia visible, sin límite de página, y se guardan en una transacción. Cambios individuales y masivos deben sobrevivir al reinicio del proceso.

Semillas públicas: n1 general; n2 rol asesor; n3 personal A; n4 personal B; n5 general fuera del centro; n6 analista; n7 rol asesor y personal A. Todos incluyen admin como rol destinatario. Las fechas de creación aumentan de n1 a n7. Inicialmente no hay lecturas ni ocultamientos.


## 5. POST /crm/registros/:id/actividades — construir el endpoint completo

El archivo `src/casos/05-actividades.ts` solo exporta un router vacío. Debes escribir `router.post('/registros/:id/actividades', ...)` dentro de ese módulo (el servidor ya lo monta bajo `/crm`). Implementa autenticación, permisos, validaciones, SQL, transacción y respuesta. No se entrega un controlador ni SQL de escritura resuelto.

Identidad mediante x-user como en los otros casos: ausente/desconocida **401**. Solo admin y asesor; analista **403**. Admin puede gestionar cualquier registro activo; asesor solo el que tenga su ID como responsable. Otro propietario o registro sin responsable para un asesor: **403**. Registro inexistente/eliminado: **404**. Semillas: r1 pertenece a asesor-a, r2 a asesor-b, r3 está eliminado y r4 no tiene responsable.

Cuerpo JSON objeto:

| Campo | Regla |
|---|---|
| tipo | Texto obligatorio; trim; llamada, correo o reunion (minúsculas) |
| resultado | Texto obligatorio; trim; contactado o sin_respuesta |
| detalle | Texto obligatorio, hasta 5000 caracteres antes de trim; no vacío después |
| fecha | Opcional: timestamp UTC canónico YYYY-MM-DDTHH:mm:ss.sssZ, fecha real y no futura; ausente significa ahora |
| proxima_accion | Opcional: texto no vacío tras trim, hasta 200 caracteres antes de trim |
| vence_at | Opcional: timestamp UTC canónico válido; debe venir junto con proxima_accion |

Los opcionales ausentes se omiten del JSON; enviar null no equivale a omitir y es inválido. tipo/resultado admiten como máximo 80 caracteres antes de trim. Rechaza ambos campos de próxima acción si alguno tiene tipo inválido o está vacío. La tarea puede tener fecha pasada: aquí se registra lo informado, no se impone una regla de vencimiento futuro. Errores de entrada: **400**, sin escrituras. Campos desconocidos se ignoran; nunca aceptar actor_id, responsable_id, registro_id o IDs de entidades desde el cuerpo.

Respuesta **201**:

```json
{
  "actividad": {
    "id": "id-generado",
    "registro_id": "r1",
    "tipo": "llamada",
    "resultado": "contactado",
    "detalle": "Conversación ficticia",
    "fecha": "2025-01-01T10:00:00.000Z",
    "actor_id": "asesor-a"
  },
  "tarea": null
}
```

Cuando hay próxima acción, tarea es `{id,registro_id,titulo,vence_at,responsable_id}`. El responsable es el del registro; si es null, el actor autenticado. IDs nuevos son cadenas únicas. Una petición válida repetida crea otra actividad; este POST no usa claves de idempotencia.

Persistencia: insertar actividad en crm_actividades; evento de acción `actividad` en crm_historial. Si hay próxima acción, insertar además crm_tareas y evento `tarea_creada`. Cada evento tiene `{id,registro_id,accion,actor_id,entidad_id,created_at}`; entidad_id referencia la actividad o tarea generada. Usar una única transacción para todo y conservar los cambios al reiniciar. El ID de evento es secuencial y el evento de actividad se registra antes que el de tarea.

Infraestructura de observación ya entregada: `GET /crm/registros/:id/resumen`, con los mismos permisos, responde `{actividades:[],tareas:[],eventos:[]}` inicialmente. Permite verificar los registros creados por HTTP; no debes reimplementar ni modificar esa ruta. Los campos corresponden a las columnas del esquema. Sus consultas son de lectura y no resuelven el POST. Esquema y semillas están preparados en schema.sql/seed.sql.
