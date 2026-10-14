# Decisiones y comprobaciones de mi entrega

Sebastian Medrano Iglesias

## Estado de cada caso

| Caso | Completo/parcial | Comprobaciones | Pendiente |
|---|---|---|---|
| Historial SQL | Completo | Ejemplos públicos y 2 pruebas mías (paginación con filtros y pagos sin relaciones) | Nada que yo sepa |
| Ciudades | Completo | Probé los ejemplos del contrato: `LÚMINA`, `última` con `bo`, `lumina` con `bo` y sin filtros | No hice prueba HTTP propia para este caso |
| Directorio | Completo | 1 prueba mía de permisos y el ejemplo público de crear contacto | Me faltó probar edición e historial |
| Notificaciones | Completo | 1 prueba mía de aislamiento y repetición, y el ejemplo público del contador | No probé el reinicio con una prueba, solo lo revisé en el código |
| Endpoint de actividades | Completo | 1 prueba mía de entrada inválida y el ejemplo público | Me faltó probar el caso con tarea y eventos |

## Decisiones de diseño

**Historial SQL.**
- Usé `LEFT JOIN` con clientes y créditos para no perder los pagos sin relaciones (como el 5). Ahí los campos salen en `null`.
- Para los filtros opcionales usé `(? IS NULL OR columna = ?)`, así la misma consulta sirve con o sin filtro y todo va con parámetros.
- Si `operacion` está vacía o es nula la muestro como `PAGO`.
- Para `valor_total`, si el valor registrado no es cero lo uso. Si es nulo o cero, sumo los seis componentes con `COALESCE` para que los nulos cuenten como cero.
- El total lo saco en otra consulta con los mismos filtros, antes de paginar.
- Ordené por `fecha_pago DESC, id_pago DESC` para que el orden sea estable.

**Ciudades.**
- Quito tildes con `normalize('NFD')` y paso todo a minúsculas, tanto lo que escribe el usuario como los datos del catálogo.
- `q` busca en `ascii`, `country` y `countryCode`. `country` busca en `country` y `countryCode`. Si vienen los dos, tienen que cumplirse los dos.
- Primero filtro y al final corto a 20 resultados, así las ciudades del final del catálogo sí pueden salir.
- Uso `filter`, que no modifica el catálogo.

**Directorio.**
- Hice una función `agenciaPermitida` que revisa el rol, el ID, que la agencia exista y que el asesor sea el dueño. Todas las rutas la usan para no repetir esa lógica.
- Los contactos siempre se buscan por su ID y la agencia de la URL. Por eso uno de otra agencia da 404, incluso para el admin.
- En `leerCuerpo` limpio los datos: nombre con trim, correo en minúsculas y con formato básico, teléfono solo con números y un `+` al inicio. Si un opcional queda vacío lo guardo como `null`.
- Las `coincidencias` son solo una advertencia: buscan otros contactos activos de la misma agencia con el mismo correo o teléfono, sin contar el propio.
- Cada crear, editar, baja o restaurar guarda el cambio y el evento de historial **en la misma transacción**, para que no quede uno sin el otro.
- Si repiten una baja o una restauración devuelvo el contacto igual, sin cambiar nada y sin crear evento. Al restaurar el ID se mantiene.
- Para buscar usé `instr`, así `%` y `_` se tratan como texto normal.

**Notificaciones.**
- Puse la regla de a quién le llega una notificación en un solo lugar (`AUDIENCIA` y `desdeAudiencia`) y la usan el listado, el contador, leer, ocultar, leer todas y limpiar. La regla es: `center=1` y (es general, o es para su rol, o es para su correo).
- Lo leído y lo oculto se guarda por usuario en la tabla `lecturas`, así lo que hace un usuario no afecta a otro ni al aviso original.
- El contador de no leídas tiene su propia consulta sin `LIMIT`, por eso no depende del `limit` del listado.
- Leer y ocultar se pueden repetir: se queda la primera fecha. Al ocultar también marco como leído si no lo estaba.
- `read-all` y `clear` van en una transacción y cuentan solo las filas que de verdad cambiaron, por eso la segunda vez da 0.
- Si la notificación no es del usuario, tiene `center=0` o no existe, respondo 404 sin cambiar nada.

**Endpoint de actividades.**
- Reviso en este orden: identidad (401), rol (403 si es analista), que el registro exista (404), que el asesor sea el responsable (403) y al final el cuerpo (400).
- Valido todo antes de abrir la transacción, así una entrada mala no guarda nada.
- `proxima_accion` y `vence_at` tienen que venir juntas. Si alguna viene como `null` la rechazo.
- No tomo IDs ni el actor del cuerpo. El actor sale de `x-user` y los IDs los genero con `randomUUID`.
- En una sola transacción guardo la actividad, el evento `actividad` y, si hay próxima acción, la tarea y el evento `tarea_creada`, en ese orden. La tarea queda a cargo del responsable del registro y, si no tiene, del actor.
- Si algo falla dentro de la transacción se hace `ROLLBACK` y no queda guardado nada, ni la actividad ni los eventos.

**Vista de demostración.**
- Hice una página sencilla en `vista/index.html` que consume los cinco módulos: pagos, ciudades, directorio, notificaciones y actividades.
- Para verla: `npm start` y abrir http://127.0.0.1:3000/ui/
- Tiene un selector de usuario (`x-user`), así se pueden comprobar los permisos (403 y 401). Además, un panel de peticiones muestra qué responde el servidor.
- Para servirla añadí una línea en `src/server.ts`, `app.use('/ui', express.static(...))`, antes del 404. No cambia ninguna ruta ni contrato.
- La búsqueda de pagos sigue exacta como pide el contrato, así que `DOC-A` funciona y `doc-a` no.

## Defectos corregidos

| Petición | Antes | Esperado | Causa |
|---|---|---|---|
| `/cities?q=%C3%BAltima&country=bo` | No aparecía la ciudad del final del catálogo | Solo `city-26` | El límite de 20 se aplicaba antes de filtrar |
| `/cities?q=lumina&country=bo` | Salían resultados que no correspondían | `[]` | El filtro de país no se combinaba bien con `q` |
| `/cities?q=L%C3%9AMINA` | No encontraba la ciudad con tilde o mayúsculas | Solo `city-1` | No se normalizaban tildes ni mayúsculas |
| `/notifications?limit=1` | El contador de no leídas cambiaba con el límite | `unreadCount` 4 | Se contaba sobre la lista ya recortada |

## Pruebas propias

Archivo: `tests-publicos/pruebas-propias.test.ts`. Comandos que ejecuté: `npm run typecheck` y `npm test`.

| Prueba | Qué hace | Fallo que detecta | Resultado |
|---|---|---|---|
| Caso 1: pagina con filtros | Pide los pagos de `DOC-A` con `limit=2`, páginas 1, 2 y 9, y el listado completo | Que el total se calcule después de paginar, que el orden no sea estable o que falle una página fuera de rango | Pasó |
| Caso 1: pagos sin relaciones | Revisa el pago 5 sin cliente ni crédito, que el 4 eliminado no salga y que `operacion` y `valor_total` estén bien | Que se pierdan pagos sin relaciones, que salgan eliminados o que el monto se calcule mal | Pasó |
| Caso 3: permiso denegado | asesor-a en la agencia 2 da 403, analista da 403, sin usuario da 401, agencia eliminada da 404, y la agencia 2 queda igual | Que un asesor administre agencias ajenas o que una petición rechazada escriba datos | Pasó |
| Caso 4: aislamiento y repetición | asesor-a oculta n1 dos veces, asesor-b lo sigue viendo y `read-all` repetido da 0 | Que lo de un usuario afecte a otro o que repetir cambie las fechas | Pasó |
| Caso 5: entrada inválida | Mando una próxima acción sin `vence_at` y luego `/resumen` sigue vacío | Que se guarde algo a medias cuando la entrada es inválida | Pasó |

## Limitaciones y siguiente mejora

- Solo hice las cinco pruebas mínimas. Con más tiempo agregaría: una de reinicio con `restart()`, una del caso 5 con tarea y eventos en orden, y una de edición e historial del directorio.
- En el directorio repito varias veces la consulta que busca un contacto por ID y agencia. La pasaría a una función. También me faltó tipar algunos `any`.
- En actividades `tipo` y `resultado` no se pasan a minúsculas: `"LLAMADA"` da 400. El contrato dice "(minúsculas)" y lo entendí de forma estricta.
- Si el JSON pesa más de 32 kb, `express.json` lo rechaza y el servidor responde 500. Eso es de la infraestructura entregada y no lo modifiqué.

## Cambio durante la demostración

Completar al final: requisito recibido, archivos modificados, pruebas y resultado.
