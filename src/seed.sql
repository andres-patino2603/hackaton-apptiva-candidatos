-- Datos inventados. Importes en unidades monetarias enteras del laboratorio.
INSERT INTO clientes VALUES ('DOC-A','Persona Demo A'),('DOC-B','Persona Demo B');
INSERT INTO creditos VALUES ('CR-A','activo'),('CR-B','finalizado');
INSERT INTO pagos VALUES
 (1,'2025-01-01','DOC-A','CR-A','transferencia',NULL,12500,10000,1000,500,0,0,0,NULL),
 (2,'2025-01-15','DOC-A','CR-A','efectivo','PAGO',NULL,10000,1000,500,200,100,300,NULL),
 (3,'2025-01-15','DOC-B','CR-B','transferencia','ABONO',0,20000,NULL,0,0,0,500,NULL),
 (4,'2025-02-01','DOC-A','CR-A','efectivo','PAGO',99999,99999,0,0,0,0,0,'2025-02-02'),
 (5,'2025-02-01',NULL,NULL,'efectivo','',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
 (6,'2025-02-02','DOC-B','CR-B','transferencia','PAGO',7500,7000,0,0,0,0,0,NULL),
 (7,'2024-12-31','DOC-A','CR-A','efectivo','PAGO',5000,5000,0,0,0,0,0,NULL);
INSERT INTO agencias VALUES
 (1,'Agencia Demo Uno','asesor-a',NULL), (2,'Agencia Demo Dos','asesor-b',NULL),
 (3,'Agencia Demo Archivada','asesor-a','2025-01-01T00:00:00.000Z');
INSERT INTO contactos VALUES
 ('c1',1,'Contacto Alfa','alfa@example.test','+570000000001',NULL,NULL,'admin','admin'),
 ('c2',2,'Contacto Beta','beta@example.test',NULL,NULL,NULL,'admin','admin'),
 ('c3',1,'Contacto Archivado','archivo@example.test',NULL,'2025-01-01T00:00:00.000Z','admin','admin','admin');
INSERT INTO notificaciones VALUES
 ('n1','Aviso general','2025-01-01T00:00:00.000Z',1,1),
 ('n2','Aviso para asesores','2025-01-02T00:00:00.000Z',0,1),
 ('n3','Aviso personal A','2025-01-03T00:00:00.000Z',0,1),
 ('n4','Aviso personal B','2025-01-04T00:00:00.000Z',0,1),
 ('n5','Aviso fuera del centro','2025-01-05T00:00:00.000Z',1,0),
 ('n6','Aviso para analistas','2025-01-06T00:00:00.000Z',0,1),
 ('n7','Aviso con dos coincidencias','2025-01-07T00:00:00.000Z',0,1);
INSERT INTO destinatarios VALUES
 ('n2','role','asesor'), ('n3','user','a@example.test'), ('n4','user','b@example.test'),
 ('n6','role','analista'), ('n7','role','asesor'), ('n7','user','a@example.test');
-- dispatch() agrega admin al scope en Apptiva. Aquí sembramos ese resultado.
INSERT INTO destinatarios SELECT id,'role','admin' FROM notificaciones;
INSERT INTO crm_registros VALUES
 ('r1','Prospecto ficticio Uno','asesor-a',NULL),
 ('r2','Prospecto ficticio Dos','asesor-b',NULL),
 ('r3','Prospecto ficticio Archivado','asesor-a','2025-01-01T00:00:00.000Z'),
 ('r4','Prospecto ficticio Sin Asignar',NULL,NULL);
