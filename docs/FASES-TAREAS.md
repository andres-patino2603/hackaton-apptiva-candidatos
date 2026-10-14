# Fases y tareas — orden de resolución

Orden maestro: backend 100% → cursor → frontend. Cada fase cierra con verificación.

---

## Fase 0 — Preparación (≈15 min)

| # | Tarea | Verificación |
|---|---|---|
| 0.1 | `npm ci` | Instala limpio |
| 0.2 | `npm run typecheck` | 0 errores |
| 0.3 | `npm test` | 1 pasa (infra), 5 fallan — estado inicial esperado |
| 0.4 | Leer `docs/REGLAS.md` | Reglas claras |

---

## Fase 1 — Caso 2: Ciudades (30 min, warmup, 10 pts)

| # | Tarea | Detalle |
|---|---|---|
| 1.1 | Normalizar | fn `normalize()` = NFD + strip `[\u0300-\u036f]` + lowercase, para `q` y `country` |
| 1.2 | Corregir filtros | `&&` en vez de `||`; `q` matchea `ascii`/`country`/`countryCode`; `country` matchea `country`/`countryCode` |
| 1.3 | Orden correcto | Filtrar PRIMERO, `slice(0,20)` DESPUÉS |
| 1.4 | No mutar catálogo | Operar sobre array, jamás `cities.sort()` in-place |
| 1.5 | Test propio | `/cities?q=%C3%BAltima&country=bo` → `[city-26]`; `q=lumina&country=bo` → `[]` |
| 1.6 | Verificar | Ejemplos caso 2 pasan |

Criterio salida: ejemplos 2 verdes + test propio nuevo verde.

---

## Fase 2 — Caso 1: Historial pagos SQL (60 min, 15 pts)

| # | Tarea | Detalle |
|---|---|---|
| 2.1 | `01-pagos.sql` | LEFT JOIN `clientes` + `creditos`, `deleted_at IS NULL` |
| 2.2 | Filtros AND | `fecha_inicio`/`fecha_fin` inclusivos (params duplicados), `cedula_cliente`, `id_credito`; ausente = `? IS NULL OR col >=/<= ?` patrón |
| 2.3 | Orden | `ORDER BY fecha_pago DESC, id_pago DESC` (desempate estable) |
| 2.4 | Paginación | `LIMIT ? OFFSET ?` — al final |
| 2.5 | `operacion` | `COALESCE(NULLIF(TRIM(operacion),''),'PAGO')` |
| 2.6 | `valor_total` | CASE: `valor_total` ≠0 y no null → ese; si no → `COALESCE(capital,0)+...+COALESCE(abono_extra,0)` |
| 2.7 | IDs relación null | `id_credito`/`cedula_cliente` del pago null → null en salida (no confundir con JOIN miss) |
| 2.8 | `01-pagos-total.sql` | `SELECT COUNT(*) AS total` — mismos filtros, sin JOIN necesarios, siempre 1 fila (subquery) |
| 2.9 | Test paginación | `cedula_cliente=DOC-A&limit=2` → IDs `[2,1]`, total 3, totalPages 2 |
| 2.10 | Test relaciones | Pago 5 → `nombre_cliente=null`, `estado_credito=null` |

Criterio salida: ejemplos 1 verdes + 2 tests propios verdes.

---

## Fase 3 — Caso 3: Directorio contactos (100 min, 20 pts)

| # | Tarea | Detalle |
|---|---|---|
| 3.1 | Helper agencia | `resolveAgencia(db, id, user)`: valida entero 1..1000000 → 400; activa → 404 si no existe/eliminada; permiso admin o dueño → 403 si analista/ajeno |
| 3.2 | Helper normalización | `normNombre` (trim, ≤150), `normCorreo` (trim→lower→regex `local@dominio.sufijo`, ≤255, vacío→null), `normTelefono` (solo dígitos y `+`, `+` solo al inicio, ≤30, vacío→null) — errores 400 |
| 3.3 | Helper coincidencias | `findCoincidencias(db, agencia, correo, tel, excluirId?)` → `[{id,nombre_completo}]` activos, correo O teléfono, sin duplicar |
| 3.4 | GET listado | `vista` activos/eliminados, `search` ≤150 substring literal (`%`/`_` literales, case-insensitive ASCII), ORDER `nombre_completo` COLLATE NOCASE + `id`, filtros ANTES de `COUNT` y `LIMIT/OFFSET`, respuesta `{items,total,page,limit}` |
| 3.5 | POST crear | 201 `{item,coincidencias}`; ID string único; `created_by`/`updated_by` = actor; evento `creacion` (anterior=null) en MISMA transacción |
| 3.6 | PATCH editar | Reemplazo completo (nombre obligatorio); solo activo (404 si eliminado); evento `actualizacion` anterior=obj previo; transacción |
| 3.7 | DELETE baja lógica | Fija `deleted_at`/`deleted_by`/`updated_by`; repetir → sin cambios, sin evento; 200 contacto completo |
| 3.8 | PATCH restaurar | Limpia `deleted_*`, conserva ID, `updated_by`=actor; repetir → sin evento; 200 |
| 3.9 | GET historial | Array eventos desc por `created_at` DESC, `id` DESC; incluye eliminados |
| 3.10 | Auditoría | `anterior`/`nuevo` = JSON contacto; transacción siempre |
| 3.11 | Test permiso | asesor-b en agencia 1 → 403 |
| 3.12 | Test extras | restaurar idempotente, búsqueda literal `%` |

Criterio salida: ejemplos 3 verdes + test permiso verde.

---

## Fase 4 — Caso 4: Notificaciones (100 min, 20 pts)

| # | Tarea | Detalle |
|---|---|---|
| 4.1 | fn `visibleAudience(user)` | SQL compartido: `center=1 AND (broadcast=1 OR role/email en destinatarios)` — USAR en listado, count, read-all, clear |
| 4.2 | Fix `unreadCount` | `SELECT COUNT` sobre audiencia completa + `read_at IS NULL` + `hidden_at IS NULL` — NO `items.length` |
| 4.3 | Fix listado | LEFT JOIN `lecturas` por `(notification_id, user_email)`; `hidden_at IS NULL` filtra ocultas propias; ORDER `created_at DESC, id DESC` |
| 4.4 | Fix read idempotente | `INSERT OR IGNORE` + solo si fila no existe; conserva primera `read_at`; no revierte `hidden_at`; validar pertenencia → 404 si fuera de audiencia/`center=0`/inexistente |
| 4.5 | Fix DELETE (ocultar) | Escribir `hidden_at` en `lecturas` (fila propia), NO `UPDATE center=0`; marca `read_at` si era null; conserva previa; idempotente; 404 si fuera de audiencia |
| 4.6 | Fix read-all | Solo cuenta los que pasaron no-leídos→leídos (`read_at IS NULL AND hidden_at IS NULL`); transacción; segunda llamada → 0 |
| 4.7 | Fix clear | UPDATE `hidden_at` solo en filas propias visibles sin ocultar; cuenta cambios reales; segunda llamada → 0 |
| 4.8 | Transacciones | Masivos completos en `db.transaction`; sobreviven reinicio |
| 4.9 | Test aislamiento | admin lee/oculta n3 → asesor-b no lo nota |
| 4.10 | Test idempotencia | read ×2 = misma fecha; clear ×2 → segundo 0 |

Criterio salida: ejemplos 4 verdes + 2 tests verdes.

---

## Fase 5 — Caso 5: Actividades CRM (90 min, 15 pts)

| # | Tarea | Detalle |
|---|---|---|
| 5.1 | Ruta | `router.post('/registros/:id/actividades', ...)` en `05-actividades.ts` |
| 5.2 | Auth | `actor(req)` → 401; rol admin/asesor, analista → 403 |
| 5.3 | Registro | `SELECT responsable_id ... deleted_at IS NULL` → 404 si no; asesor ajeno/`responsable_id` null → 403 |
| 5.4 | Validación body | objeto JSON; `tipo` ∈ {llamada, correo, reunion} trim ≤80; `resultado` ∈ {contactado, sin_respuesta} trim ≤80; `detalle` trim ≤5000 no vacío; `fecha` opcional `YYYY-MM-DDTHH:mm:ss.sssZ` real ≤ahora; `proxima_accion` ≤200 no vacía SOLO con `vence_at` válido; ausente ≠ null (null → 400); desconocidos ignorados → 400 sin escrituras |
| 5.5 | IDs | `randomUUID()` o timestamp — cadena única |
| 5.6 | Transacción | INSERT `crm_actividades` → evento `actividad` → si tarea: INSERT `crm_tareas` → evento `tarea_creada`; todo 1 `db.transaction` |
| 5.7 | Tarea | `titulo` = `proxima_accion`; `responsable_id` = registro.responsable_id ?? actor.id |
| 5.8 | Respuesta | 201 `{actividad:{...7 campos}, tarea: null\|{...5 campos}}` |
| 5.9 | Test rechazo | `proxima_accion` sin `vence_at` → 400 y GET resumen vacío (0 actividad, 0 tarea, 0 evento) |
| 5.10 | Test persistencia | `restart()` del helper → datos siguen ahí |

Criterio salida: ejemplos 5 verdes + 2 tests verdes.

---

## Fase 6 — Batería tests propios (45 min, 10 pts)

Mínimo 5 tests en archivos nuevos `tests-publicos/*.test.ts`:

| Archivo (sugerido) | Cubre |
|---|---|
| `pagos-relaciones.test.ts` | paginación con filtros + pago sin relaciones (fase 2) |
| `contactos-permisos.test.ts` | permiso denegado 403 (fase 3) |
| `notificaciones-aislamiento.test.ts` | aislamiento + idempotencia (fase 4) |
| `actividades-validacion.test.ts` | 400 sin escrituras (fase 5) |
| `ciudades-normalizacion.test.ts` | tildes/mayúsculas + ambos filtros AND (fase 1) |

| # | Tarea |
|---|---|
| 6.1 | Ejecutar `npm test` — todo verde |
| 6.2 | `npm run typecheck` — 0 errores |

---

## Fase 7 — Documentación (45 min, 10 pts)

| # | Tarea |
|---|---|
| 7.1 | Rellenar `DECISIONES.md`: tabla estado, decisiones diseño, defectos corregidos (petición/antes/después/causa), pruebas propias (archivo, escenario, fallo detectado, comando), limitaciones |
| 7.2 | Explicar en DECISIONES: reglas centralizadas caso 4; rollback caso 5 |
| 7.3 | Revisar `docs/REGLAS.md` contra lo hecho |

---

## Fase 8 — Cursor pagination (extra, después backend verde)

| # | Tarea | Detalle |
|---|---|---|
| 8.1 | Parse `cursor` | query param opcional; base64url decode → `fecha|id`; inválido → 400 |
| 8.2 | SQL keyset | `(fecha_pago < ?) OR (fecha_pago = ? AND id_pago < ?)` AND mismos filtros, mismo orden, LIMIT |
| 8.3 | Header respuesta | `X-Next-Cursor` = base64url último item; fin → omitir header |
| 8.4 | Sin cursor | Ruta exacta actual intacta (byte a byte mismo comportamiento) |
| 8.5 | Test cursor | Página 1 sin cursor = actual; con cursor → siguientes, sin solapamiento |

---

## Fase 9 — Frontend (extra, 0 pts, solo demo)

| # | Tarea |
|---|---|
| 9.1 | Scaffold: `npm create vite@latest web -- --template react-ts` |
| 9.2 | Deps: tailwindcss + @tailwindcss/vite, react-router-dom, @tanstack/react-query, react-hook-form, zod, @hookform/resolvers |
| 9.3 | `npx shadcn@latest init` + add: button, input, table, select, dialog, tabs, sonner, badge, card, form |
| 9.4 | `web/vite.config.ts`: alias `@` + proxy (`/pagos`,`/cities`,`/agencias`,`/notifications`,`/crm`,`/health` → `127.0.0.1:3000`) |
| 9.5 | `lib/api.ts`: fetch + `x-user` desde localStorage |
| 9.6 | Layout: nav + selector identidad (admin/asesor-a/asesor-b/analista) |
| 9.7 | Vista Ciudades: buscador debounce q+country |
| 9.8 | Vista Pagos: tabla + filtros fecha/crédito/cliente + paginación offset + "cargar más" (cursor) |
| 9.9 | Vista Notificaciones: lista, unreadCount, marcar leído, ocultar, read-all, clear |
| 9.10 | Vista Contactos: CRUD (si tiempo) |
| 9.11 | Vista CRM: form actividad + ver resumen (si tiempo) |
| 9.12 | Verificar: `cd web; npm run build` OK + raíz `typecheck`/`test` intactos |

---

## Regla de avance

No pasar de fase sin: (1) ejemplos públicos de ese caso verdes, (2) tests propios de esa fase verdes, (3) `typecheck` limpio. Si tiempo ajustado → recortar fases 8-9, nunca 1-7.
