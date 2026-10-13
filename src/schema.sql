CREATE TABLE clientes (cedula_cliente TEXT PRIMARY KEY, nombre_completo TEXT NOT NULL);
CREATE TABLE creditos (id_credito TEXT PRIMARY KEY, estado TEXT NOT NULL);
CREATE TABLE pagos (
  id_pago INTEGER PRIMARY KEY, fecha_pago TEXT NOT NULL,
  cedula_cliente TEXT REFERENCES clientes(cedula_cliente), id_credito TEXT REFERENCES creditos(id_credito),
  metodo_pago TEXT NOT NULL, operacion TEXT, valor_total INTEGER,
  capital INTEGER, interes INTEGER, aval INTEGER, mora INTEGER, cobranza INTEGER, abono_extra INTEGER,
  deleted_at TEXT
);
CREATE INDEX pagos_fecha ON pagos(fecha_pago DESC,id_pago DESC);
CREATE TABLE agencias (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, advisor_id TEXT, deleted_at TEXT);
CREATE TABLE contactos (
  id TEXT PRIMARY KEY, id_agencia INTEGER NOT NULL REFERENCES agencias(id),
  nombre_completo TEXT NOT NULL, correo TEXT, telefono TEXT,
  deleted_at TEXT, deleted_by TEXT, created_by TEXT NOT NULL, updated_by TEXT NOT NULL
);
CREATE INDEX contactos_agencia ON contactos(id_agencia, deleted_at);
CREATE TABLE eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, contacto_id TEXT NOT NULL REFERENCES contactos(id),
  accion TEXT NOT NULL, actor_id TEXT NOT NULL, anterior TEXT, nuevo TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE notificaciones (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL,
  broadcast INTEGER NOT NULL DEFAULT 0, center INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE destinatarios (
  notification_id TEXT NOT NULL REFERENCES notificaciones(id), tipo TEXT NOT NULL CHECK(tipo IN ('role','user')),
  valor TEXT NOT NULL, PRIMARY KEY(notification_id,tipo,valor)
);
CREATE TABLE lecturas (
  notification_id TEXT NOT NULL REFERENCES notificaciones(id), user_email TEXT NOT NULL,
  read_at TEXT NOT NULL, hidden_at TEXT, PRIMARY KEY(notification_id,user_email)
);
CREATE TABLE crm_registros (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, responsable_id TEXT, deleted_at TEXT);
CREATE TABLE crm_actividades (
  id TEXT PRIMARY KEY, registro_id TEXT NOT NULL REFERENCES crm_registros(id),
  tipo TEXT NOT NULL, resultado TEXT NOT NULL, detalle TEXT NOT NULL, fecha TEXT NOT NULL, actor_id TEXT NOT NULL
);
CREATE TABLE crm_tareas (
  id TEXT PRIMARY KEY, registro_id TEXT NOT NULL REFERENCES crm_registros(id),
  titulo TEXT NOT NULL, vence_at TEXT NOT NULL, responsable_id TEXT NOT NULL
);
CREATE TABLE crm_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT, registro_id TEXT NOT NULL REFERENCES crm_registros(id),
  accion TEXT NOT NULL, actor_id TEXT NOT NULL, entidad_id TEXT NOT NULL, created_at TEXT NOT NULL
);
