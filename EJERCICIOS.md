# Enunciados

## 1. Historial de pagos — SQL (60 minutos orientativos)

El equipo administrativo necesita consultar pagos junto con su cliente y crédito. Completa `01-pagos.sql` y `01-pagos-total.sql`: relaciones, exclusión de eliminados, filtros por fecha/cliente/crédito, total antes de paginar y orden estable. Conserva pagos sin relaciones y calcula el monto alternativo cuando el total es cero o nulo.

La conexión, la ruta y las validaciones ya funcionan. Lee el contrato y el esquema; resuelve el trabajo en SQL parametrizado. Este requisito se revisará manualmente además de los tests HTTP. Incluye una prueba propia para paginación con filtros y otra para relaciones opcionales.

Orden sugerido de resolución: comienza por ciudades como calentamiento y continúa con este caso. La numeración de archivos mantiene la organización del proyecto.

## 2. Ciudades — corrección de errores

El selector debe encontrar una ciudad por nombre, país o código de país, ignorando mayúsculas y tildes. El filtro explícito de país debe combinarse con la búsqueda general. Actualmente aparecen resultados que no corresponden y algunos registros del final del catálogo nunca aparecen.

Corrige `02-ciudades.ts`, conserva el orden y el límite de veinte resultados y evita modificar el catálogo entre peticiones. En `DECISIONES.md`, explica los defectos encontrados y los casos que utilizaste para comprobarlos.

## 3. Directorio de asesores — desarrollo administrativo

Cada agencia mantiene contactos, con nombre, correo y teléfono. Un asesor comercial solo administra agencias asignadas a él; un administrador puede administrar todas las agencias activas. Implementa listado, creación, edición, baja lógica, restauración e historial según el contrato.

Normaliza entradas, devuelve advertencias por coincidencia de correo o teléfono, conserva el ID al restaurar y registra cada cambio real junto con su estado anterior y nuevo. Modificación e historial deben guardarse en una misma transacción. No es necesario implementar pantallas ni administrar las agencias.

## 4. Notificaciones — mantenimiento de código

El centro muestra avisos generales, por rol o por usuario. El módulo actual tiene reglas repetidas y regresiones: el contador puede depender del tamaño de la lista, acciones de un usuario pueden afectar a otro y las operaciones repetidas pueden producir resultados inconsistentes.

Corrige el módulo y extrae una definición compartida de audiencia/visibilidad que mantenga coherentes listado, contador, lectura y limpieza. Conserva la API. Los cambios deben sobrevivir al reinicio; lectura y ocultamiento deben ser idempotentes por usuario. Las operaciones masivas son transaccionales y cuentan cambios reales.

Documenta qué reglas centralizaste y cómo comprobaste aislamiento, repetición y persistencia. Los tests evalúan resultados; la ausencia de duplicación, la claridad de responsabilidades y el uso de transacciones se revisan manualmente.


## Pruebas propias y explicación

Dispones de seis ejemplos públicos en `tests-publicos/ejemplos.test.ts`; ejecútalos con `npm test`. El estado inicial debe fallar en los cinco ejemplos funcionales y pasar el de infraestructura. No representan toda la evaluación. No elimines ni debilites las assertions de los ejemplos.

Añade al menos cinco pruebas HTTP propias en archivos `*.test.ts` dentro de `tests-publicos`: cubre paginación/relaciones, un permiso denegado del directorio y una regresión de aislamiento o idempotencia de notificaciones, además del caso 5 descrito abajo. Explica qué fallo detecta cada una. Se valora que prueben comportamiento y efectos posteriores; copiar el mismo ejemplo con otro nombre no cuenta como cobertura nueva.

Reserva 45 minutos para pruebas y documentación. La defensa dura 45 minutos: 15 para demostrar dos flujos y explicar decisiones, 20 para una modificación pequeña del contrato que se entregará en ese momento y 10 para comprobarla y explicar el resultado. El cambio usará las mismas herramientas y no requerirá un caso de uso nuevo. Se anuncia desde ahora para que forme parte del tiempo y evaluación conocidos.


## 5. Actividad comercial — endpoint desde cero (60–90 minutos)

Un asesor registra una gestión realizada sobre un prospecto; puede dejar también una próxima tarea. Construye POST /crm/registros/:id/actividades según CONTRATO.md. Tu archivo 05-actividades.ts está vacío: debes declarar la ruta y programar lectura/validación del body, identificación del actor, permisos por responsable, consultas parametrizadas, transacción y respuesta HTTP.

Solo se entregan conexión, tablas, datos ficticios, montaje del router y una ruta auxiliar GET de observación. Contrasta con pagos: allí completas SQL dentro de una ruta existente; aquí construyes el endpoint completo. No implementes pantallas ni cambies otros casos.

Añade una prueba HTTP propia del caso: por ejemplo, rechazar una próxima acción sin fecha y comprobar después que no se guardó actividad, tarea ni evento. Explica en DECISIONES.md qué ocurre si una escritura falla dentro de la transacción.
