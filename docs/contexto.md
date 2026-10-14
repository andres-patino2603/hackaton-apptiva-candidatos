Qué es
Hackathon laboratorio — API administrativa Node/TypeScript/Express + SQLite (sql.js). 5 ejercicios con errores intencionales. Entregas: código + tests + DECISIONES.md.
Stack
- Node ≥20, Express 4, sql.js (SQLite en memoria, persiste a archivo), TypeScript, Vitest
- DB: data/lab.sqlite (auto-crea con schema + seed)
- Identidad: header x-user (admin, asesor-a, asesor-b, analista) — no JWT
Estructura
src/
  server.ts          — monta routers en Express
  db.ts              — openDb: all/get/run/transaction (síncrono)
  http.ts            — HttpError, actor(req), scalar(), integer()
  schema.sql         — 10 tablas (pagos, contactos, notificaciones, crm_*)
  seed.sql           — datos ficticios
  fixtures/cities.ts — catálogo ciudades
  crm-lectura.ts     — GET /crm/registros/:id/resumen (ya hecho, no tocar)
  casos/
    01-pagos.ts + 01-pagos.sql + 01-pagos-total.sql
    02-ciudades.ts
    03-contactos.ts
    04-notificaciones.ts
    05-actividades.ts
tests-publicos/ejemplos.test.ts — 6 tests (1 infra pasa, 5 fallan)
Los 5 casos
1. Historial pagos — SQL (15 pts, ~60 min)
GET /pagos/historial — ruta/validationes listas. Solo completar 2 SQLs:
- 01-pagos.sql: JOIN clientes+creditos, filtros fecha/crédito/cliente (parametrizados, pares de params para LIKE o IS NULL), deleted_at IS NULL, orden fecha_pago DESC,id_pago DESC, LIMIT/OFFSET
- 01-pagos-total.sql: COUNT con mismos filtros, siempre 1 fila
- operacion null/vacío → "PAGO"
- valor_total si ≠0 usa ese; si null/0 → suma capital+interes+aval+mora+cobranza+abono_extra (null=0)
- Pagos sin relaciones se conservan, campos null
- Params: [fecha_inicio×2, fecha_fin×2, cedula×2, credito×2, limit, offset]
2. Ciudades — bugfix (10 pts, ~30 min, warmup)
GET /cities — defectos en 02-ciudades.ts:
1. slice(0,20) ANTES de filtrar → registros finales nunca aparecen
2. Filtro con || en vez de && → resultados que no corresponden
3. Sin normalización Unicode (case + diacríticos) → no encuentra tildes
4. No busca en country, solo countryCode
3. Directorio asesores — CRUD completo (20 pts, ~100 min)
/agencias/:agencia/asesores — desde cero (hoy 501). 6 endpoints:
- GET listado (paginado, vista activos/eliminados, search)
- POST crear (201, con coincidencias warning)
- PATCH editar (reemplazo completo, no parcial)
- DELETE baja lógica, PATCH restaurar, GET historial
- Permisos: admin ve todo agencia activa; asesor solo su agencia
- Normalización: email lowercase+regex, teléfono dígitos/+
- Auditoría: tabla eventos con anterior/nuevo, transaccional
- coincidencias: otros contactos activos misma agencia, mismo correo O teléfono
4. Notificaciones — mantenimiento (20 pts, ~100 min)
Módulo legado con bugs. Defectos actuales:
1. unreadCount = items.filter(...).length → depende del limit en vez de toda la audiencia
2. DELETE oculta globalmente (center=0) → afecta a todos los usuarios
3. INSERT OR REPLACE en read → pisa fecha previa, no idempotente
4. read-all/clear: updated cuenta toda la audiencia, no solo cambios reales; clear no usa hidden_at sino center=0
5. Audiencia duplicada en 3 queries → extraer función compartida
6. No valida que notificación pertenezca al actor antes de 404
5. Actividades CRM — endpoint desde cero (15 pts, ~60-90 min)
POST /crm/registros/:id/actividades — router vacío. Implementar:
- Auth x-user, permisos (admin/asesor, dueño del registro)
- Validar body: tipo ∈ {llamada, correo, reunion}, resultado ∈ {contactado, sin_respuesta}, detalle ≤5000, fecha opcional no futura, proxima_accion+vence_at juntos
- Transacción: insert actividad + evento actividad + (si tarea) insert tarea + evento tarea_creada
- Responder 201 {actividad, tarea}
Orden sugerido (JORNADA.md)
1. Ciudades (warmup)
2. Historial SQL
3. Directorio
4. Notificaciones
5. Actividades
6. Tests propios + DECISIONES.md
Comandos
npm ci
npm run typecheck
npm test          # 1 pasa, 5 fallan (estado inicial esperado)
npm start         # http://127.0.0.1:3000
Tests propios requeridos
Mínimo 5 en tests-publicos/*.test.ts: paginación/relaciones, permiso denegado directorio, regresión notificaciones, caso 5. Explicar en DECISIONES.md qué fallo detecta cada uno.