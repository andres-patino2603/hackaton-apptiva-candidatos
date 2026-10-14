# Hackatón Apptiva — API administrativa + frontend demo

Backend Express/SQLite con cinco funcionalidades (historial de pagos, buscador de ciudades, directorio de contactos, notificaciones y actividades CRM), más un frontend React demo en `web/`. La infraestructura funciona y los cinco casos están implementados, corregidos y con tests.

## Requisitos

- Node.js >=20.20 y npm
- No necesitas Apptiva, PostgreSQL, cuentas ni credenciales

## Instalación

```powershell
git clone https://github.com/andres-patino2603/hackaton-apptiva-candidatos.git
cd hackaton-apptiva-candidatos
npm ci
```

## Despliegue

### Backend

```powershell
npm start
```

Arranca en `http://127.0.0.1:3000` e imprime `APPTIVA_READY=http://127.0.0.1:3000`.

Verificación:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
# {"ok": true}
Invoke-RestMethod http://127.0.0.1:3000/pagos/historial -Headers @{"x-user"="admin"}
```

Variables de entorno:

| Variable | Efecto | Por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `DB_PATH` | Ruta del archivo SQLite | `data/lab.sqlite` |

El primer arranque crea `data/lab.sqlite` con datos ficticios. Para volver al estado inicial, detén el servidor y elimina solo ese archivo.

### Frontend (demo)

Terminal separada:

```powershell
cd web
npm install
npm run dev
```

Abre `http://localhost:5173`. Vite proxea las rutas de la API (`/pagos`, `/cities`, `/agencias`, `/notifications`, `/crm`, `/health`) a `http://127.0.0.1:3000`.

El frontend incluye un selector de identidad (`admin`, `asesor-a`, `asesor-b`, `analista`) que envía el header `x-user` en cada petición. Cada identidad ve solo lo que sus permisos permiten.

Build de producción:

```powershell
cd web
npm run build
```

## Verificación

```powershell
npm run typecheck   # 0 errores
npm test            # 26/26 verdes (6 ejemplos públicos + 20 propios)
```

Cada test arranca su propio servidor con SQLite temporal; no requiere `npm start`.

## Estructura

```
src/
  server.ts                 # Bootstrap Express
  db.ts                     # Acceso SQLite (sql.js), transacciones
  http.ts                   # actor(req) — identidad por header x-user
  schema.sql, seed.sql      # Esquema y datos iniciales (no modificar)
  fixtures/cities.ts        # Catálogo de ciudades (no modificar)
  crm-lectura.ts            # GET auxiliar de resumen CRM
  casos/
    01-pagos.ts             # Historial con filtros, offset y cursor
    01-pagos.sql            # Consulta principal
    01-pagos-total.sql      # COUNT con mismos filtros
    01-pagos-cursor.sql     # Keyset para paginación por cursor
    02-ciudades.ts          # Buscador con normalización de tildes
    03-contactos.ts         # Directorio CRUD con auditoría
    04-notificaciones.ts    # Audiencia por usuario, idempotencia
    05-actividades.ts       # POST CRM con transacción actividad+tarea
tests-publicos/
  ejemplos.test.ts          # 6 ejemplos del contrato (no tocar)
  pagos.test.ts             # 4 tests: filtros, nulls, permisos, cursor
  ciudades.test.ts          # 4 tests: AND, subcadena, orden, límite
  contactos.test.ts         # 4 tests: permisos, idempotencia, LIKE, auditoría
  notificaciones.test.ts    # 4 tests: aislamiento, idempotencia, transacción
  actividades.test.ts       # 4 tests: validación, permisos, persistencia
web/                        # Frontend demo (aislado, su propio package.json)
docs/
  REGLAS.md                 # Reglas del laboratorio y conflictos verificados
  FASES-TAREAS.md           # Plan de resolución por fases
  APROBACION.md             # Resumen de aprobación y explicación de cursor
  test.md                   # Qué prueba cada archivo de tests
DECISIONES.md               # Decisiones de diseño, defectos corregidos, limitaciones
CONTRATO.md, EJERCICIOS.md  # Enunciados originales
```

## Autenticación

No hay login. El header `x-user` identifica al usuario:

| `x-user` | Rol | Alcance |
|---|---|---|
| `admin` | admin | Todo |
| `asesor-a` | asesor | Agencia 1, registro r1 |
| `asesor-b` | asesor | Agencia 2, registro r2 |
| `analista` | analista | Solo lectura de pagos y ciudades |

Sin header → 401. Rol insuficiente → 403.

## Paginación

`GET /pagos/historial` soporta dos modos:

- **Offset** (contrato original): `?page=2&limit=20` → `{items,total,page,limit,totalPages}`
- **Cursor** (extra): misma respuesta + header `X-Next-Cursor` cuando hay más páginas. Reenviar ese valor como `?cursor=...` para la siguiente tanda sin solapamiento ni pérdida aunque lleguen pagos nuevos.

## Documentación

- [DECISIONES.md](DECISIONES.md) — qué se cambió, por qué, defectos corregidos y limitaciones
- [docs/APROBACION.md](docs/APROBACION.md) — resumen por caso y explicación de la paginación por cursor
- [docs/test.md](docs/test.md) — qué valida cada archivo de tests
- [CONTRATO.md](CONTRATO.md) y [EJERCICIOS.md](EJERCICIOS.md) — enunciados originales del hackatón
