# Hackatón de desarrollo — candidato

Implementa cinco funcionalidades de una API administrativa. La infraestructura funciona, pero hay dos consultas del historial incompletas, un buscador defectuoso, un directorio pendiente un módulo de notificaciones que necesita mantenimiento y un endpoint de actividades por construir desde cero. Los errores de este laboratorio son intencionales.

## Descargar el proyecto

Puedes usar **Code → Download ZIP** en GitHub y extraerlo, o clonarlo:

```powershell
git clone https://github.com/andres-patino2603/hackaton-apptiva-candidatos.git
cd hackaton-apptiva-candidatos
```

Si descargaste el ZIP, abre una terminal dentro de la carpeta extraída que contiene `package.json` y `package-lock.json`. Ejecuta allí los comandos siguientes; este repositorio ya contiene únicamente el proyecto del candidato.

## Preparación

Requisitos: Node.js >=20.20 y npm. No necesitas Apptiva, PostgreSQL, cuentas ni credenciales.

```powershell
npm ci
npm run typecheck
npm test
npm start
```

**Estado inicial esperado:** TypeScript compila. `npm test` aprueba el ejemplo de infraestructura y falla en los cinco funcionales: debes resolverlos. Los tests inician su propio servidor; `npm start` sirve para probar manualmente.

Abre `http://127.0.0.1:3000/health`; devuelve `{"ok":true}`. El servidor imprime `APPTIVA_READY=...`. En PowerShell puedes consultar:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/pagos/historial -Headers @{"x-user"="admin"}
Invoke-RestMethod "http://127.0.0.1:3000/cities?q=lumina"
```

El primer arranque crea `data/lab.sqlite` con datos ficticios. Para volver a los datos iniciales, detén el servidor y elimina solo ese archivo. `DB_PATH` permite elegir otra base y `PORT` cambiar el puerto. En evaluación se usa `PORT=0` y un `DB_PATH` temporal.

## Trabajo

Lee [CONTRATO.md](CONTRATO.md) y los cinco [enunciados](EJERCICIOS.md). Puedes reorganizar `src/casos` y crear servicios o repositorios. Mantén las rutas y contratos públicos. No cambies el esquema inicial, los fixtures, el mecanismo de identidad, `DB_PATH`, `PORT` ni el mensaje de inicio: son la base común de evaluación. Puedes añadir índices o módulos propios compatibles.

- `src/casos/01-pagos.sql` y `01-pagos-total.sql`: consultas pendientes.
- `src/casos/02-ciudades.ts`: buscador con regresiones.
- `src/casos/03-contactos.ts`: directorio por implementar, responde 501.
- `src/casos/04-notificaciones.ts`: módulo legado con fallos didácticos.
- `src/db.ts`: acceso a SQLite, transacciones y persistencia.
- `src/schema.sql`, `src/seed.sql`, `src/fixtures/cities.ts`: estructura y datos públicos del laboratorio.

`db.all` consulta filas, `db.get` devuelve la primera, `db.run` modifica sin guardar por sí solo y `db.transaction(() => ...)` confirma y guarda o revierte ante una excepción. Sus callbacks son síncronos: no uses `async` dentro. Este motor está pensado para un único proceso servidor por archivo SQLite. Usa parámetros SQL para valores externos.

Entrega tu proyecto sin `node_modules` ni `data`, junto con `DECISIONES.md`: cambios realizados, comprobaciones propias, decisiones de diseño y limitaciones conocidas. Debes añadir tus propias pruebas según EJERCICIOS.md. Hay seis ejemplos públicos; la evaluación completa es privada. Se evalúa comportamiento observable y calidad del código, no nombres internos de funciones ni una arquitectura obligatoria.

Los tests públicos arrancan y terminan el servidor automáticamente; no requieren `npm start`. Cada test usa su propio SQLite temporal. `DECISIONES.md` incluye una plantilla de entrega y `JORNADA.md` el horario orientativo. Si conservas una base de la versión anterior del laboratorio, detén el servidor y elimina únicamente esa base local para que se cree el nuevo esquema.

**Caso 5 nuevo:** `src/casos/05-actividades.ts` es un router vacío. Implementa el POST completo de actividades comerciales. `src/crm-lectura.ts` solo proporciona el GET auxiliar para consultar sus efectos.
