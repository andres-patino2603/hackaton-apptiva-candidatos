# Qué prueba cada archivo de tests

26 tests en total: 6 ejemplos oficiales + 20 propios.

---

## `ejemplos.test.ts` — 6 tests (los dio el hackathon, no tocar)

1. `/health` responde `{ok:true}`
2. Filtra pagos por cliente DOC-A → 3 resultados `[2,1,7]`
3. Encuentra ciudad `LÚMINA` ignorando tildes/mayúsculas
4. Crear contacto de mi agencia → 201 y trim de nombre
5. `unreadCount` no depende de `limit` (limit=1 pero cuenta 4)
6. Crear actividad CRM → 201 con actividad y `tarea: null`

---

## `pagos.test.ts` — 4 tests propios (caso 1)

1. **Filtros combinados + paginación**: fechas + cédula + limit=2 → total=2, page2 vacía, total estable
2. **Pago sin relaciones**: pago id 5 → `cedula_cliente`, `id_credito`, `nombre_cliente`, `estado_credito` en `null`, `valor_total: 0`
3. **Permisos y validación**: asesor → 403, sin auth → 401, fecha_fin < fecha_inicio → 400, limit=0 → 400
4. **Cursor**: recorre `[6,5,3]` → `[2,1,7]` sin solapamiento, header `X-Next-Cursor` al inicio y fin, cursor basura → 400, offset sigue intacto

---

## `ciudades.test.ts` — 4 tests propios (caso 2)

1. **AND entre q y country**: `q=ultima&country=bo` → `[city-26]`; `q=lumina&country=bo` → `[]`
2. **country = subcadena** en country/countryCode: `country=BO` → `[city-2, city-26]`
3. **No limitar antes de filtrar**: `q=villa` alcanza 20 resultados; `q=ultima` encuentra city-26 (del final del catálogo)
4. **Orden + máximo 20**: sin filtros → primeras 20 en orden `city-1` a `city-20`

---

## `contactos.test.ts` — 4 tests propios (caso 3)

1. **Permisos**: asesor ajeno → 403, analista → 403, agencia archivada → 404, agencia inexistente → 404
2. **Baja/restaurar idempotente**: DELETE ×2 conserva mismo `deleted_at` (un solo evento `baja`), PATCH restaurar limpia `deleted_at`, historial tiene 1 `baja` + 1 `restauracion`
3. **Búsqueda literal**: `search=%25` (un `%` real) encuentra "Literal 100% Test"; `%%%` → `[]` (no es comodín SQL)
4. **Edición con auditoría**: PATCH valida nombre (sin él → 400), evento `actualizacion` guarda `anterior` y `nuevo`

---

## `notificaciones.test.ts` — 4 tests propios (caso 4)

1. **Aislamiento por usuario**: asesor-a lee/oculta n3 → no la ve; admin todavía la ve `readAt: null`
2. **Idempotencia**: read ×2 conserva la primera fecha; clear → 1ª vez >0, 2ª vez 0
3. **read-all transaccional**: cuenta solo no leídos, 2ª vez 0, y tras `restart()` (proceso nuevo) sigue 0
4. **404 de audiencia**: notificación de otro centro, inexistente, o center=0 → 404

---

## `actividades.test.ts` — 4 tests propios (caso 5)

1. **Validación sin escritura**: `proxima_accion` sin `vence_at` → 400 y resumen con 0 actividades/tareas/eventos (nada escrito)
2. **Creación completa**: actividad + tarea + eventos en orden `actividad` → `tarea_creada`, responsable = responsable del registro; tipo `"Correo"` se normaliza a `correo`
3. **Permisos**: analista → 403, asesor ajeno → 403, registro eliminado (r3) → 404, asesor sobre registro sin responsable (r4) → 403
4. **Persistencia**: escritura válida → `restart()` del servidor → datos siguen en SQLite

---

## Resumen de cobertura

| Archivo | Tests | Cubre | Bugs que detectaría |
|---|---|---|---|
| pagos | 4 | SQL filtros, LEFT JOIN nulls, permisos, cursor | filtro OR mal, JOIN inner, OFFSET roto |
| ciudades | 4 | normalización, AND, orden, slice | filtros OR, limitar antes de filtrar |
| contactos | 4 | permisos agencia, idempotencia, LIKE literal, auditoría | soft-delete duro, % como comodín |
| notificaciones | 4 | audiencia, idempotencia, transacciones, persistencia | contador desde items.length, center=0 global |
| actividades | 4 | validación, transacción, permisos, persistencia | escritura parcial, evento mal ordenado |

Son 20 propios + 6 ejemplos = 26 tests. Cada test usa `httpLab()` de `tests-publicos/http.ts`: arranca servidor + SQLite temporal por test.
