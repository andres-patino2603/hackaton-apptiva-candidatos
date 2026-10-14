# Decisiones y comprobaciones de mi entrega

Nombre o identificador del participante: [Anuar Fontalvo]

## Estado de cada caso

| Caso | Completo/parcial | Comprobaciones | Pendiente |
|---|---|---|---|
| Historial SQL | Completo | `npm run typecheck` sin errores; test público en verde (cliente DOC-A con `limit=2` devuelve IDs 2 y 1, total 3); pruebas propias de paginación con filtros y de relaciones opcionales en verde | Ninguno conocido |
| Ciudades | Completo | `typecheck` sin errores; test público de tildes en verde (`última` encuentra `city-26`) | Ninguno conocido |
| Directorio | Completo | `typecheck` sin errores; test público de crear contacto en verde; pruebas propias de permiso denegado, baja repetida, restauración e historial en verde. Se corrigió el montaje del router (`/agencias` + sub-router `/:agencia/asesores`) | El contrato no define qué responde un asesor a la agencia 3 (eliminada): mi código devuelve 404, podría esperarse 403 |
| Notificaciones | Completo | `typecheck` sin errores; test público del contador independiente de `limit` en verde; pruebas propias de aislamiento, idempotencia, 404 sin efectos y operaciones masivas en verde | Ninguno conocido |
| Endpoint de actividades | Completo | `typecheck` sin errores; test público en verde; pruebas propias de rechazo sin escrituras, permisos por responsable y tarea con sus eventos en verde | El orden 403 antes de 400 es decisión mía, el contrato no lo fija |

## Decisiones de diseño

**Historial de pagos.** Todo se resuelve en SQL parametrizado. Uso `LEFT JOIN` a `clientes` y `creditos` para conservar pagos sin relaciones (el pago 5 sale con esos campos en null). Excluyo eliminados con `deleted_at IS NULL`. Los filtros opcionales usan `(? IS NULL OR campo = ?)` en el orden de parámetros del contrato. El orden `fecha_pago DESC, id_pago DESC` desempata fechas iguales y mantiene estables las páginas. `operacion` usa `COALESCE(NULLIF(TRIM(...), ''), 'PAGO')`. `valor_total` usa el registrado si no es nulo ni cero; si no, suma los seis componentes con `COALESCE(x, 0)`, porque en SQL `NULL + 5` da `NULL`. El total usa los mismos filtros sin `LIMIT` ni `OFFSET`; no necesita JOIN porque los filtros solo tocan `pagos`, y `COUNT(*)` siempre devuelve una fila.

**Ciudades.** Una función de normalización (NFD, sin diacríticos, minúsculas) se aplica al texto buscado y al del catálogo. Los dos filtros se combinan con AND. Primero se filtra y después se limita a veinte, así se conserva el orden y aparecen las ciudades del final. El catálogo no se modifica porque `filter` y `slice` crean arreglos nuevos.

**Directorio de asesores.** Un middleware común antes de todas las rutas resuelve identidad (401), ID de agencia (400), rol (403), agencia inexistente o eliminada (404) y propiedad del asesor (403). Un contacto de otra agencia da 404 incluso para admin, porque la búsqueda filtra por id y por agencia. Normalizo y valido nombre, correo y teléfono antes de abrir la transacción, para que un 400 nunca modifique datos. Las coincidencias salen de una sola consulta (`correo = ? OR telefono = ?`) sobre contactos activos de la misma agencia, excluyendo el propio: un contacto que coincide por ambos campos sale una vez y un null nunca coincide. La baja es lógica (`deleted_at`), así que se puede restaurar conservando el ID. Baja y restauración repetidas devuelven el contacto sin escribir ni agregar eventos. Cada cambio y su evento de auditoría van en la misma transacción: si falla el evento, se revierte el cambio.

**Notificaciones.** Centralicé dos definiciones. `AUDIENCIA`: el aviso participa si `center=1` y es general, o su rol o su correo figuran como destinatarios; uso `EXISTS` para que varias coincidencias no dupliquen el aviso. `VISIBLES`: la audiencia más el estado propio del usuario (`lecturas` filtrada por su correo) y que no esté oculto por él. Las usan el listado, el contador, `read-all` y `clear`; las operaciones individuales usan `exigirAudiencia`. El estado de lectura y ocultamiento vive en `lecturas`, por usuario, nunca en el aviso. `INSERT OR IGNORE` conserva la primera fecha al repetir. Las masivas seleccionan solo lo que cambia y van en una transacción, así que `updated` cuenta cambios reales. El contador tiene su propia consulta, sin depender de `limit`.

**Endpoint de actividades.** Orden: identidad (401), rol (403), registro (404, o 403 por responsable), validación del cuerpo (400) y una única transacción de escritura. Distingo null de ausente: un opcional en null es inválido. La fecha se valida comparando con `toISOString()` para rechazar fechas imposibles como 2025-02-30, y no puede ser futura. `proxima_accion` y `vence_at` van juntas o ninguna. `actor_id`, `registro_id` y los IDs de entidades nunca se toman del cuerpo. Se escriben actividad, su evento y, si hay próxima acción, la tarea y su evento. El responsable de la tarea es el del registro o, si es null, el actor.

**Si una escritura falla dentro de la transacción.** `db.transaction` ejecuta `ROLLBACK` y relanza el error: no queda actividad, tarea ni evento, y no se persiste nada en disco.

## Defectos corregidos

**Ciudades**

| Petición | Resultado anterior | Resultado esperado | Causa |
|---|---|---|---|
| `/cities` con una ciudad del final del catálogo (por ejemplo `q=última&country=bo`) | Nunca aparecía | Devuelve solo `city-26` | `slice(0, 20)` antes de `filter` |
| `/cities?q=LÚMINA` | Devolvía las 20 ciudades | Devuelve solo `city-1` | Filtros combinados con OR: si faltaba uno, pasaba todo |
| Búsqueda con mayúsculas o tildes | No encontraba | Ignora mayúsculas y diacríticos | Comparación sin normalizar |
| `q` por nombre de país o código | No encontraba | Busca en `ascii`, `country` o `countryCode` | `q` solo miraba `ascii` |
| `country=bo` o un fragmento del nombre | Solo igualdad exacta con el código | Subcadena en `country` o `countryCode` | Comparación con `===` |

**Notificaciones**

| Petición | Resultado anterior | Resultado esperado | Causa |
|---|---|---|---|
| `GET /notifications?limit=1` | `unreadCount` = 1 | `unreadCount` = 4, con 1 item | El contador se calculaba sobre la lista recortada |
| Lectura u ocultamiento de un usuario | Afectaba lo que veían otros | Solo afecta a quien lo hace | `LEFT JOIN lecturas` sin filtrar por usuario |
| Avisos con la misma fecha | Orden inestable | `createdAt DESC, id DESC` | Faltaba desempate por ID |
| `PATCH /:id/read` repetido | Sobrescribía la fecha y desocultaba | Conserva la primera fecha | `INSERT OR REPLACE` |
| `PATCH /:id/read` de un aviso ajeno | 200 | 404 sin efectos | No comprobaba la audiencia |
| `DELETE /:id` | Ocultaba para todos (`center=0`) | Oculta solo para el actor | Modificaba el aviso global |
| `read-all` y `clear` | `updated` contaba todos, incluso ocultos | Solo cambios reales; segunda llamada devuelve 0 | Contaban la audiencia y no los cambios |
| Todas las rutas | Regla de audiencia copiada tres veces | Una sola definición | Duplicación de código |

## Pruebas propias

Archivo: `tests-publicos/mis-pruebas.test.ts`. Comandos ejecutados: `npm run typecheck` y `npm test`. Resultado: todas en verde, junto con los 6 ejemplos públicos.

| # | Escenario | Fallo que detecta | Resultado |
|---|---|---|---|
| 1 | Paginación con filtros por cliente, tres páginas | Total calculado tras paginar; páginas que repiten filas | Pasa |
| 2 | Relaciones opcionales, eliminados y monto alternativo | INNER JOIN que pierde el pago 5; eliminado visible; monto sin sumar | Pasa |
| 3 | Escritura de asesor ajeno y de analista en el directorio | Escrituras previas al chequeo de permisos | Pasa |
| 4 | Baja repetida, restauración e historial | Eventos duplicados; restauración que cambia el ID | Pasa |
| 5 | Dos usuarios leen y ocultan avisos | Estado de lectura compartido entre usuarios | Pasa |
| 6 | Repetir lectura y ocultamiento; masivas dos veces; 404 | Fechas sobrescritas; masivas que cuentan de más | Pasa |
| 7 | Próxima acción sin fecha | Validar después de escribir; datos a medias | Pasa |
| 8 | Actividad con tarea y eventos | Eventos en orden equivocado; `actor_id` tomado del cuerpo | Pasa |
| 9 | Permisos por responsable | 403 y 404 mal asignados | Pasa |

## Limitaciones y siguiente mejora

- El contrato no define qué responde un asesor a una agencia eliminada (agencia 3). Mi código devuelve 404 porque comprueba existencia antes que propiedad. Si se esperara 403, bastaría reordenar `exigirAgencia`.
- El contrato no fija el orden entre 403 y 400 en actividades. Elegí autenticar y autorizar antes de validar el cuerpo.
- El motor SQLite está pensado para un único proceso servidor por archivo.
- Siguiente mejora: más pruebas de bordes (fechas inválidas en pagos, parámetros repetidos, límites de longitud en el directorio y fechas futuras en actividades).

## Cambio durante la demostración

Completar al final: requisito recibido, archivos modificados, pruebas y resultado.