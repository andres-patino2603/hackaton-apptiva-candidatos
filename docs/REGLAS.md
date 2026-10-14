# Reglas y restricciones — entrega 100%

Fuente: `README.md`, `CONTRATO.md`, `EJERCICIOS.md`, `JORNADA.md` + decisiones del equipo. Verificación de conflictos al final.

## 1. Inviolables (no tocar jamás)

| Elemento | Motivo |
|---|---|
| `src/schema.sql` — tablas iniciales | Base común de evaluación |
| `src/seed.sql` — fixtures | Datos públicos idénticos para todos |
| `src/fixtures/cities.ts` | Catálogo no alterable entre peticiones |
| Mecanismo identidad (`x-user` → `actor()` en `src/http.ts`) | Evaluación depende de él |
| `DB_PATH`, `PORT` (env vars) | Eval usa `PORT=0` + `DB_PATH` temporal |
| Mensaje inicio `APPTIVA_READY=...` | Harness de tests lo parsea |
| Rutas y formas de respuesta públicas | Tests privados las verifican |
| Ejemplos en `tests-publicos/ejemplos.test.ts` | No eliminar ni debilitar assertions |
| Casos 5 rutas existentes fuera de `05-actividades.ts` | Solo POST nuevo ahí; `crm-lectura.ts` no se toca |

Permitido con cuidado: añadir índices en `schema.sql` compatibles; reorganizar `src/casos`; crear servicios/repositorios propios.

## 2. Reglas de código

- Node ≥20.20, ESM (`"type":"module"`), importaciones con extensión `.js` (NodeNext).
- TypeScript estricto: `npm run typecheck` pasa siempre.
- `db.all` / `db.get` / `db.run` / `db.transaction` **síncronos**: cero `async` dentro de callbacks de transacción.
- SQL siempre parametrizado (`?`). Nunca interpolar valores externos. Nunca hardcodear resultados del seed.
- `db.transaction`: commit si callback OK, rollback si lanza excepción, persiste a archivo tras commit.
- Un proceso servidor por archivo SQLite (sql.js).
- Errores: `HttpError` con status. Cuerpo error siempre `{"error":"texto"}` (texto no se compara exacto).
- Query params: solo textos únicos. Repetidos o estructurados (`?a=1&a=2`, arrays) → 400.
- Enteros: sin decimales, sin fragmentos SQL. Fuera de rango → 400.
- Validación fallida → 400 **sin modificar datos**.
- Timestamps: ISO 8601 UTC. IDs nuevos: cadenas únicas, formato libre.
- Campos desconocidos del body → ignorar. Nunca aceptar IDs de entidades desde el body (caso 5).

## 3. Permisos (todos los casos)

| Usuario | Rol |
|---|---|
| `admin` | admin |
| `asesor-a` / `asesor-b` | asesor |
| `analista` | analista |

- Header ausente/desconocido → 401.
- Rol sin acceso → 403. Entidad inexistente/eliminada/ajena → 404.
- Solo `/cities` y `/health` públicos.

## 4. Restricciones por caso

### Caso 1 — pagos (SQL)
- Solo completar `01-pagos.sql` y `01-pagos-total.sql`. Ruta/validaciones ya hechas.
- Orden fijo: `fecha_pago DESC, id_pago DESC`. Excluir `deleted_at NOT NULL`.
- `total` con filtros ANTES de paginar. `totalPages = max(1, ceil(total/limit))`.
- Respuesta exacta `{items,total,page,limit,totalPages}`. Item exacto: 9 campos del contrato.
- Relaciones LEFT JOIN (conservar pagos sin cliente/crédito → null).
- `operacion` null/vacío → `"PAGO"`. `valor_total` ≠0 manda; si no, suma 6 componentes (null=0).
- Orden estable incluye `id_pago` como desempate (pagos 2 y 3 misma fecha).

### Caso 2 — ciudades
- Normalización Unicode NFD (mayúsculas + diacríticos) en `q` y `country`.
- `q` busca en `ascii`, `country`, `countryCode`. `country` en `country`, `countryCode`. Ambos → AND.
- Filtrar ANTES de limitar a 20. `slice(0,20)` actual = bug.
- Preservar orden catálogo. No mutar `cities`.

### Caso 3 — directorio
- 6 endpoints, todos con transacción donde haya escritura + auditoría (`eventos`).
- Baja lógica nunca borra. RESTaurar conserva ID.
- Repetir DELETE/restaurar → sin cambios ni eventos nuevos.
- `coincidencias`: correo O teléfono normalizado, mismos activos de la agencia, excluye propio ID en edición.
- Modificación + evento en MISMA transacción.
- Edición de contacto eliminado → 404. Contacto ajeno a agencia URL → 404 (incluso admin).
- PATCH = reemplazo completo, no parcial.

### Caso 4 — notificaciones
- Audiencia: `broadcast=1` OR rol/email en `destinatarios`, solo `center=1`. Múltiples coincidencias → 1 copia.
- Lectura/ocultamiento por par (notificación, usuario): jamás afectar a otro usuario ni al global.
- Idempotentes: conservar PRIMERA fecha `readAt`/`hiddenAt`.
- `hidden_at` en `lecturas`, NO `center=0` (afectaría a todos).
- `unreadCount` = toda audiencia visible no leída, independiente de `limit`.
- `updated` = solo cambios reales. Segunda llamada → 0.
- Masivos en transacción, sin límite de página.
- Fuera de audiencia / `center=0` / inexistente → 404 sin efectos.
- Persistir tras reinicio (guardar en archivo vía `transaction`).

### Caso 5 — actividades CRM
- Escribir TODO en `05-actividades.ts` (router vacío hoy).
- Body: `tipo` ∈ {llamada, correo, reunion}, `resultado` ∈ {contactado, sin_respuesta}, `detalle` ≤5000 no vacío, `fecha` opcional real no futura, `proxima_accion`+`vence_at` juntos o ausentes.
- Opcionales: ausente ≠ null (null → 400).
- Una transacción: actividad → evento `actividad` → (tarea → evento `tarea_creada`). Evento de actividad ANTES que tarea.
- `responsable_id` de registro; si null → actor.
- 401 sin identidad, 403 analista/ajeno, 404 registro inexistente/eliminado.
- No reimplementar `GET /crm/registros/:id/resumen`.

## 5. Tests

- Mínimo 5 tests propios `*.test.ts` en `tests-publicos/` (además de 6 ejemplos intactos):
  1. paginación con filtros + relaciones opcionales (caso 1)
  2. permiso denegado directorio (caso 3)
  3. regresión aislamiento o idempotencia notificaciones (caso 4)
  4. caso 5: rechazo sin escrituras (ej. `proxima_accion` sin `vence_at`)
  5. sexto libre (ej. cursor o restauración directorio)
- Cada test explicado en `DECISIONES.md`: escenario + fallo que detecta.
- Estado inicial: 1 ejemplo infra pasa, 5 funcionales fallan.
- Usar helper `httpLab()` de `tests-publicos/http.ts`. Cada test = servidor + SQLite temporal propios.
- `vitest.config.ts` solo incluye `tests-publicos/**` — no cambiar (rompería harness).
- `tsconfig.json` solo `src` + `tests-publicos` — no cambiar.

## 6. Entrega

- `DECISIONES.md` relleno (plantilla propia): estado por caso, decisiones, defectos, pruebas, limitaciones, cambio demo.
- Sin `node_modules/` ni `data/` (borrar `data/lab.sqlite` antes de entregar).
- `npm run typecheck` + `npm test` verdes al final.
- Orden trabajo (JORNADA.md): Ciudades → SQL pagos → Directorio → Notificaciones → Actividades → tests/docs → demo.

## 7. Extras propios (fuera de puntuación)

- **Cursor pagination**: param opcional `cursor` en `GET /pagos/historial` + header `X-Next-Cursor`. Sin cursor → comportamiento contrato intacto.
- **Frontend `web/`**: React + Vite + Tailwind + shadcn/ui, carpeta aparte con `package.json`/`tsconfig` propios. Proxy Vite en lugar de tocar `server.ts`. Solo después de backend 100%.

## 8. Verificación de conflictos

| Conflicto potencial | Veredicto | Resolución |
|---|---|---|
| Cursor extra vs respuesta exacta `{items,total,page,limit,totalPages}` | Resuelto | Siguiente cursor por header `X-Next-Cursor`, body intacto |
| Param `cursor` vs "query params textos únicos" | OK | `cursor` = texto único; contrato no prohíbe params extra |
| `web/` vs "no se requiere frontend" | OK | No prohíbe, solo no puntúa; aislado en carpeta propia |
| `web/` vs tsconfig/vitest raíz | OK | Includes solo `src`+`tests-publicos`; `web/` queda fuera |
| Tests propios en `tests-publicos/` vs "no debilitar ejemplos" | OK | Archivos nuevos, ejemplos intactos |
| Índices en `schema.sql` vs "no cambiar esquema inicial" | OK | README permite añadir índices compatibles |
| Reutilizar `actor()` caso 5 vs "no cambiar mecanismo identidad" | OK | Reutilizar ≠ cambiar |
| `DECISIONES.md` vs falta de plantilla | OK | Plantilla en repo, rellenar |
| Borrar `data/` vs "solo eliminar lab.sqlite" | OK | Borrar solo `data/lab.sqlite`, nunca `data/` completa si hay otras DB |
| Touch root `package.json` scripts vs base común | Evitar | Raíz intacta; comandos frontend vía `cd web` |
| `sql.js` memoria vs tests multi-proceso | OK | Cada test = proceso + archivo SQLite propios (helper lo hace) |
| Idempotencia lectura vs "crea la primera fecha" | OK | Insert solo si no existe fila; `INSERT OR IGNORE` + conservar read_at |
| Caso 5 transacción vs error → rollback | OK | Excepción dentro de `db.transaction` revierte todo; test prueba ausencia de escrituras |

Sin conflictos sin resolver. Regla maestra: si duda, contrato (`CONTRATO.md`) manda sobre código actual.
