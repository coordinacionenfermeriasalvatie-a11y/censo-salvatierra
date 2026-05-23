-- ============================================================
-- CENSO HOSPITALARIO - HOSPITAL GENERAL CON ESPECIALIDADES
-- "JUAN MARIA DE SALVATIERRA" - IMSS BIENESTAR
-- Esquema completo para Supabase PostgreSQL
-- ============================================================
-- Ejecutar este archivo en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- ------------------------------------------------------------
-- 1. EXTENSIONES NECESARIAS
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- 2. TABLA DE USUARIOS DEL SISTEMA (perfiles)
-- ------------------------------------------------------------
-- Supabase ya provee auth.users, aqui guardamos info adicional
CREATE TABLE IF NOT EXISTS perfiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  matricula       TEXT UNIQUE NOT NULL,
  nombre_completo TEXT NOT NULL,
  rol             TEXT NOT NULL CHECK (rol IN ('subjefe', 'supervisor', 'gestor', 'enfermera')),
  servicio_id     INTEGER,
  turno_principal TEXT CHECK (turno_principal IN ('M', 'V', 'N', 'JORNADA')),
  activo          BOOLEAN DEFAULT TRUE,
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  ultimo_acceso   TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- 3. CATALOGOS INSTITUCIONALES
-- ------------------------------------------------------------

-- Servicios del hospital (los 10)
CREATE TABLE servicios (
  id        SERIAL PRIMARY KEY,
  codigo    TEXT UNIQUE NOT NULL,
  nombre    TEXT NOT NULL,
  total_camas INTEGER NOT NULL,
  orden     INTEGER NOT NULL
);

INSERT INTO servicios (codigo, nombre, total_camas, orden) VALUES
  ('01_URGENCIAS',         'URGENCIAS',             27, 1),
  ('02_TOCO_CIRUGIA',      'TOCO CIRUGIA',          15, 2),
  ('03_PSIQUIATRIA',       'PSIQUIATRIA',           20, 3),
  ('04_UCIA',              'UCIA',                  8,  4),
  ('05_CUIDADOS_INTERMED', 'CUIDADOS INTERMEDIOS',  8,  5),
  ('06_PEDIATRIA',         'PEDIATRIA',             39, 6),
  ('07_HOSP_HOMBRES_1',    'HOSP HOMBRES 1',        20, 7),
  ('08_HOSP_HOMBRES_2',    'HOSP HOMBRES 2',        22, 8),
  ('09_HOSP_MUJERES',      'HOSP MUJERES',          28, 9),
  ('10_ONCOLOGIA_PED',     'ONCOLOGIA PEDIATRICA',  13, 10);

-- Subservicios (algunos servicios se dividen)
CREATE TABLE subservicios (
  id          SERIAL PRIMARY KEY,
  servicio_id INTEGER NOT NULL REFERENCES servicios(id),
  nombre      TEXT NOT NULL,
  orden       INTEGER NOT NULL,
  UNIQUE(servicio_id, nombre)
);

-- 01 Urgencias: 5 subservicios
INSERT INTO subservicios (servicio_id, nombre, orden) VALUES
  (1, 'OBSERVACION', 1),
  (1, 'SALA DE CHOQUE', 2),
  (1, 'CURACIONES', 3),
  (1, 'ANEXOS', 4),
  (1, 'URGENCIAS PEDIATRICAS', 5);

-- 02 Toco Cirugia: 2 subservicios
INSERT INTO subservicios (servicio_id, nombre, orden) VALUES
  (2, 'OBSERVACION TOCO', 1),
  (2, 'RECUPERACION TOCO', 2);

-- 03 Psiquiatria: 1 subservicio
INSERT INTO subservicios (servicio_id, nombre, orden) VALUES
  (3, 'PSIQUIATRIA', 1);

-- 04 UCIA: 1 subservicio
INSERT INTO subservicios (servicio_id, nombre, orden) VALUES
  (4, 'UCIA', 1);

-- 05 Cuidados Intermedios: 1 subservicio
INSERT INTO subservicios (servicio_id, nombre, orden) VALUES
  (5, 'CUIDADOS INTERMEDIOS', 1);

-- 06 Pediatria: 6 subservicios
INSERT INTO subservicios (servicio_id, nombre, orden) VALUES
  (6, 'UCIP', 1),
  (6, 'UCIN', 2),
  (6, 'UTIP', 3),
  (6, 'CRECIMIENTO Y DESARROLLO', 4),
  (6, 'ESCOLARES', 5),
  (6, 'LACTANTES', 6);

-- 07 Hosp Hombres 1
INSERT INTO subservicios (servicio_id, nombre, orden) VALUES
  (7, 'HOSPITALIZACION HOMBRES 1', 1);

-- 08 Hosp Hombres 2
INSERT INTO subservicios (servicio_id, nombre, orden) VALUES
  (8, 'HOSPITALIZACION HOMBRES 2', 1);

-- 09 Hosp Mujeres
INSERT INTO subservicios (servicio_id, nombre, orden) VALUES
  (9, 'HOSPITALIZACION MUJERES', 1);

-- 10 Oncologia Pediatrica
INSERT INTO subservicios (servicio_id, nombre, orden) VALUES
  (10, 'ONCOLOGIA PEDIATRICA', 1);

-- Camas individuales (200 total con rangos no consecutivos)
CREATE TABLE camas (
  id              SERIAL PRIMARY KEY,
  subservicio_id  INTEGER NOT NULL REFERENCES subservicios(id),
  numero_cama     TEXT NOT NULL,
  activa          BOOLEAN DEFAULT TRUE,
  UNIQUE(subservicio_id, numero_cama)
);

-- 01 Urgencias - OBSERVACION (1-11)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (1,'1'),(1,'2'),(1,'3'),(1,'4'),(1,'5'),(1,'6'),(1,'7'),(1,'8'),(1,'9'),(1,'10'),(1,'11');

-- 01 Urgencias - SALA DE CHOQUE (1-2)
INSERT INTO camas (subservicio_id, numero_cama) VALUES (2,'1'),(2,'2');

-- 01 Urgencias - CURACIONES (1-2)
INSERT INTO camas (subservicio_id, numero_cama) VALUES (3,'1'),(3,'2');

-- 01 Urgencias - ANEXOS (1-7)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (4,'1'),(4,'2'),(4,'3'),(4,'4'),(4,'5'),(4,'6'),(4,'7');

-- 01 Urgencias - URGENCIAS PEDIATRICAS (1-5)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (5,'1'),(5,'2'),(5,'3'),(5,'4'),(5,'5');

-- 02 Toco Cirugia - OBSERVACION TOCO (1-13)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (6,'1'),(6,'2'),(6,'3'),(6,'4'),(6,'5'),(6,'6'),(6,'7'),(6,'8'),(6,'9'),(6,'10'),(6,'11'),(6,'12'),(6,'13');

-- 02 Toco Cirugia - RECUPERACION TOCO (1-2)
INSERT INTO camas (subservicio_id, numero_cama) VALUES (7,'1'),(7,'2');

-- 03 Psiquiatria (1-20)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (8,'1'),(8,'2'),(8,'3'),(8,'4'),(8,'5'),(8,'6'),(8,'7'),(8,'8'),(8,'9'),(8,'10'),
  (8,'11'),(8,'12'),(8,'13'),(8,'14'),(8,'15'),(8,'16'),(8,'17'),(8,'18'),(8,'19'),(8,'20');

-- 04 UCIA (1-8)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (9,'1'),(9,'2'),(9,'3'),(9,'4'),(9,'5'),(9,'6'),(9,'7'),(9,'8');

-- 05 Cuidados Intermedios (1-8)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (10,'1'),(10,'2'),(10,'3'),(10,'4'),(10,'5'),(10,'6'),(10,'7'),(10,'8');

-- 06 Pediatria - UCIP (1-4)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (11,'1'),(11,'2'),(11,'3'),(11,'4');

-- 06 Pediatria - UCIN (1-6)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (12,'1'),(12,'2'),(12,'3'),(12,'4'),(12,'5'),(12,'6');

-- 06 Pediatria - UTIP (1-4)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (13,'1'),(13,'2'),(13,'3'),(13,'4');

-- 06 Pediatria - CRECIMIENTO Y DESARROLLO (1-6)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (14,'1'),(14,'2'),(14,'3'),(14,'4'),(14,'5'),(14,'6');

-- 06 Pediatria - ESCOLARES (82-92)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (15,'82'),(15,'83'),(15,'84'),(15,'85'),(15,'86'),(15,'87'),(15,'88'),(15,'89'),(15,'90'),(15,'91'),(15,'92');

-- 06 Pediatria - LACTANTES (93-100)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (16,'93'),(16,'94'),(16,'95'),(16,'96'),(16,'97'),(16,'98'),(16,'99'),(16,'100');

-- 07 Hosp Hombres 1 (1-17, 79-81)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (17,'1'),(17,'2'),(17,'3'),(17,'4'),(17,'5'),(17,'6'),(17,'7'),(17,'8'),(17,'9'),(17,'10'),
  (17,'11'),(17,'12'),(17,'13'),(17,'14'),(17,'15'),(17,'16'),(17,'17'),
  (17,'79'),(17,'80'),(17,'81');

-- 08 Hosp Hombres 2 (18-34, 24A, 24B, 76-78)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (18,'18'),(18,'19'),(18,'20'),(18,'21'),(18,'22'),(18,'23'),(18,'24'),
  (18,'24A'),(18,'24B'),
  (18,'25'),(18,'26'),(18,'27'),(18,'28'),(18,'29'),(18,'30'),(18,'31'),(18,'32'),(18,'33'),(18,'34'),
  (18,'76'),(18,'77'),(18,'78');

-- 09 Hosp Mujeres (35-40, 54-75)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (19,'35'),(19,'36'),(19,'37'),(19,'38'),(19,'39'),(19,'40'),
  (19,'54'),(19,'55'),(19,'56'),(19,'57'),(19,'58'),(19,'59'),(19,'60'),
  (19,'61'),(19,'62'),(19,'63'),(19,'64'),(19,'65'),(19,'66'),(19,'67'),
  (19,'68'),(19,'69'),(19,'70'),(19,'71'),(19,'72'),(19,'73'),(19,'74'),(19,'75');

-- 10 Oncologia Pediatrica (41-53)
INSERT INTO camas (subservicio_id, numero_cama) VALUES
  (20,'41'),(20,'42'),(20,'43'),(20,'44'),(20,'45'),(20,'46'),(20,'47'),(20,'48'),(20,'49'),(20,'50'),(20,'51'),(20,'52'),(20,'53');

-- Catalogo: Especialidades medicas
CREATE TABLE catalogo_especialidades (
  id     SERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL
);

INSERT INTO catalogo_especialidades (nombre) VALUES
  ('PEDIATRIA'), ('GINECOLOGIA Y OBSTETRICIA'), ('CIRUGIA GENERAL'),
  ('MEDICINA FAMILIAR'), ('URGENCIAS MEDICO-QUIRURGICAS'), ('PSIQUIATRIA'),
  ('DERMATOLOGIA'), ('CARDIOLOGIA'), ('NEUMOLOGIA'), ('GASTROENTEROLOGIA'),
  ('NEFROLOGIA'), ('ENDOCRINOLOGIA'), ('CARDIOLOGIA INTERVENCIONISTA'),
  ('ENDOSCOPIA DIGESTIVA'), ('NEFROLOGIA INTERVENCIONISTA'),
  ('ONCOLOGIA PEDIATRICA'), ('INFECTOLOGIA HOSPITALARIA'),
  ('MEDICINA MATERNO-FETAL'), ('REUMATOLOGIA'), ('INFECTOLOGIA'),
  ('GERIATRIA'), ('HEMATOLOGIA'), ('TRAUMATOLOGIA Y ORTOPEDIA'),
  ('NEUROCIRUGIA'), ('CIRUGIA CARDIOTORACICA'), ('CIRUGIA PEDIATRICA'),
  ('CIRUGIA PLASTICA Y RECONSTRUCTIVA'), ('UROLOGIA'), ('OFTALMOLOGIA'),
  ('OTORRINOLARINGOLOGIA'), ('GINECOLOGIA QUIRURGICA'), ('RADIOLOGIA E IMAGEN'),
  ('MEDICINA CRITICA (TERAPIA INTENSIVA)'), ('NEONATOLOGIA'),
  ('ONCOLOGIA MEDICA'), ('HEMATO-ONCOLOGIA'), ('CUIDADOS PALIATIVOS'),
  ('MEDICINA DEL DOLOR'), ('URGENCIAS PEDIATRICAS');

-- Catalogo: Motivos de egreso
CREATE TABLE catalogo_motivos_egreso (
  id     SERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL
);

INSERT INTO catalogo_motivos_egreso (nombre) VALUES
  ('DEFUNCION'), ('ALTA POR MAXIMO BENEFICIO'),
  ('ALTA POR CURACION'), ('FUGA'), ('OTRO');

-- Catalogo: Tipos de dieta
CREATE TABLE catalogo_dietas (
  id     SERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL
);

INSERT INTO catalogo_dietas (nombre) VALUES
  ('DIETA HIPOCALORICA'), ('DIETA HIPOSODICA'), ('DIETA DIABETICA'),
  ('DIETA PARA RENAL'), ('DIETA PARA HEPATICO'), ('DIETA PARA CARDIACO'),
  ('AYUNO'), ('NPT (NUTRICION PARENTERAL TOTAL)'),
  ('NEC (NUTRICION ENTERAL)'), ('OTRA');

-- Catalogo: Precauciones de aislamiento
CREATE TABLE catalogo_aislamientos (
  id     SERIAL PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  emoji  TEXT
);

INSERT INTO catalogo_aislamientos (codigo, nombre, emoji) VALUES
  ('CONTACTO',      'POR CONTACTO',      '🟡'),
  ('PROTECTOR',     'PROTECTOR',         '⬜'),
  ('CONTACTO_PLUS', 'POR CONTACTO PLUS', '🟫');

-- ------------------------------------------------------------
-- 4. TABLA CENTRAL: PACIENTES
-- ------------------------------------------------------------
CREATE TABLE pacientes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cama_id           INTEGER NOT NULL REFERENCES camas(id),
  nombre_paciente   TEXT NOT NULL,
  edad              INTEGER NOT NULL CHECK (edad >= 0 AND edad <= 130),
  genero            TEXT NOT NULL CHECK (genero IN ('MASCULINO', 'FEMENINO')),
  nss_curp          TEXT,
  diagnostico_ingreso TEXT NOT NULL,
  especialidad_id   INTEGER REFERENCES catalogo_especialidades(id),
  fecha_ingreso     DATE NOT NULL,
  hora_ingreso      TIME NOT NULL,
  fecha_egreso      DATE,
  hora_egreso       TIME,
  motivo_egreso_id  INTEGER REFERENCES catalogo_motivos_egreso(id),
  dias_estancia     INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN fecha_egreso IS NULL THEN NULL
      ELSE (fecha_egreso - fecha_ingreso)::INTEGER
    END
  ) STORED,
  observaciones     TEXT,
  estado            TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'EGRESADO', 'TRASLADADO')),
  capturado_por     UUID NOT NULL REFERENCES auth.users(id),
  capturado_en      TIMESTAMPTZ DEFAULT NOW(),
  sellado           BOOLEAN DEFAULT FALSE,
  sellado_en        TIMESTAMPTZ,
  hash_sello        TEXT
);

CREATE INDEX idx_pacientes_cama ON pacientes(cama_id);
CREATE INDEX idx_pacientes_estado ON pacientes(estado);
CREATE INDEX idx_pacientes_fecha_ingreso ON pacientes(fecha_ingreso);

-- ------------------------------------------------------------
-- 5. FORMATO DE CONTROL (procedimientos por paciente)
-- ------------------------------------------------------------
CREATE TABLE formato_control (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id       UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  turno             TEXT NOT NULL CHECK (turno IN ('M', 'V', 'N')),
  ventilacion_mecanica BOOLEAN DEFAULT FALSE,
  cvp_instalado     BOOLEAN DEFAULT FALSE,
  cvc_instalado     BOOLEAN DEFAULT FALSE,
  cateter_umbilical BOOLEAN DEFAULT FALSE,
  lisis_lavado      BOOLEAN DEFAULT FALSE,
  curacion_cvp      BOOLEAN DEFAULT FALSE,
  curacion_cvc      BOOLEAN DEFAULT FALSE,
  refijacion_cvc    BOOLEAN DEFAULT FALSE,
  sonda_gastrica    BOOLEAN DEFAULT FALSE,
  sonda_pleurostomia BOOLEAN DEFAULT FALSE,
  cateter_urinario  BOOLEAN DEFAULT FALSE,
  estomas           BOOLEAN DEFAULT FALSE,
  heridas           BOOLEAN DEFAULT FALSE,
  suturas           INTEGER DEFAULT 0,
  riesgo_upp        BOOLEAN DEFAULT FALSE,
  riesgo_caidas     BOOLEAN DEFAULT FALSE,
  aislamiento_id    INTEGER REFERENCES catalogo_aislamientos(id),
  oxigeno           BOOLEAN DEFAULT FALSE,
  interconsulta     BOOLEAN DEFAULT FALSE,
  glucemia_capilar  BOOLEAN DEFAULT FALSE,
  hemoderivados     BOOLEAN DEFAULT FALSE,
  laboratorios      BOOLEAN DEFAULT FALSE,
  estudios_gabinete BOOLEAN DEFAULT FALSE,
  traslado          BOOLEAN DEFAULT FALSE,
  higiene_general   BOOLEAN DEFAULT FALSE,
  observaciones     TEXT,
  capturado_por     UUID NOT NULL REFERENCES auth.users(id),
  capturado_en      TIMESTAMPTZ DEFAULT NOW(),
  sellado           BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_control_paciente ON formato_control(paciente_id);
CREATE INDEX idx_control_fecha ON formato_control(fecha);

-- ------------------------------------------------------------
-- 6. DIETAS
-- ------------------------------------------------------------
CREATE TABLE dietas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id   UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  dieta_id      INTEGER NOT NULL REFERENCES catalogo_dietas(id),
  consistencia  TEXT,
  restricciones TEXT,
  observaciones TEXT,
  capturado_por UUID NOT NULL REFERENCES auth.users(id),
  capturado_en  TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 7. RECETARIO
-- ------------------------------------------------------------
CREATE TABLE recetario (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id   UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  medicamento   TEXT NOT NULL,
  prescripcion  TEXT,
  solicitada    BOOLEAN DEFAULT FALSE,
  dispensada    BOOLEAN DEFAULT FALSE,
  capturado_por UUID NOT NULL REFERENCES auth.users(id),
  capturado_en  TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 8. AUDITORIA (la pieza clave de inmutabilidad)
-- ------------------------------------------------------------
CREATE TABLE auditoria (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tabla         TEXT NOT NULL,
  registro_id   UUID NOT NULL,
  operacion     TEXT NOT NULL CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE', 'CORRECCION', 'SELLADO')),
  campo         TEXT,
  valor_anterior JSONB,
  valor_nuevo   JSONB,
  motivo        TEXT,
  usuario_id    UUID REFERENCES auth.users(id),
  ip_origen     TEXT,
  registrado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auditoria_tabla_reg ON auditoria(tabla, registro_id);
CREATE INDEX idx_auditoria_fecha ON auditoria(registrado_en);

-- ------------------------------------------------------------
-- 9. HISTORICO DE EGRESOS (archivo permanente)
-- ------------------------------------------------------------
CREATE TABLE historicos_egresos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id     UUID NOT NULL,
  snapshot_completo JSONB NOT NULL,
  fecha_egreso    DATE NOT NULL,
  hash_integridad TEXT NOT NULL,
  archivado_en    TIMESTAMPTZ DEFAULT NOW(),
  archivado_por   UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_historicos_fecha ON historicos_egresos(fecha_egreso);

-- ------------------------------------------------------------
-- 10. TRIGGERS DE AUDITORIA AUTOMATICA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auditar_cambio()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria(tabla, registro_id, operacion, valor_nuevo, usuario_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO auditoria(tabla, registro_id, operacion, valor_anterior, valor_nuevo, usuario_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auditar_pacientes
AFTER INSERT OR UPDATE ON pacientes
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();

CREATE TRIGGER trg_auditar_control
AFTER INSERT OR UPDATE ON formato_control
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();

CREATE TRIGGER trg_auditar_dietas
AFTER INSERT OR UPDATE ON dietas
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();

CREATE TRIGGER trg_auditar_recetario
AFTER INSERT OR UPDATE ON recetario
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();

-- ------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (la inmutabilidad real)
-- ------------------------------------------------------------
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE formato_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE dietas ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetario ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE historicos_egresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

-- Politica: usuarios autenticados pueden leer todo
CREATE POLICY lectura_autenticados_pacientes ON pacientes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY lectura_autenticados_control ON formato_control
  FOR SELECT TO authenticated USING (true);

CREATE POLICY lectura_autenticados_dietas ON dietas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY lectura_autenticados_recetario ON recetario
  FOR SELECT TO authenticated USING (true);

CREATE POLICY lectura_autenticados_perfiles ON perfiles
  FOR SELECT TO authenticated USING (true);

-- Politica: cualquier autenticado puede insertar
CREATE POLICY insercion_autenticados_pacientes ON pacientes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = capturado_por);

CREATE POLICY insercion_autenticados_control ON formato_control
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = capturado_por);

CREATE POLICY insercion_autenticados_dietas ON dietas
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = capturado_por);

CREATE POLICY insercion_autenticados_recetario ON recetario
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = capturado_por);

-- Politica: solo se puede actualizar si NO esta sellado
CREATE POLICY actualizar_no_sellado_pacientes ON pacientes
  FOR UPDATE TO authenticated
  USING (sellado = FALSE)
  WITH CHECK (sellado = FALSE);

CREATE POLICY actualizar_no_sellado_control ON formato_control
  FOR UPDATE TO authenticated
  USING (sellado = FALSE)
  WITH CHECK (sellado = FALSE);

-- Politica: NUNCA se permite DELETE (esta es la inmutabilidad fuerte)
-- No se crea ninguna politica DELETE, lo que efectivamente prohibe borrar

-- Politica: la tabla auditoria es solo lectura para usuarios normales
CREATE POLICY lectura_auditoria_solo_lectura ON auditoria
  FOR SELECT TO authenticated USING (true);

-- Politica: historicos solo se pueden insertar y leer, nunca modificar
CREATE POLICY lectura_historicos ON historicos_egresos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY insercion_historicos ON historicos_egresos
  FOR INSERT TO authenticated WITH CHECK (true);

-- ------------------------------------------------------------
-- 12. VISTA DE OCUPACION EN TIEMPO REAL
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_ocupacion_servicios AS
SELECT
  s.id AS servicio_id,
  s.codigo,
  s.nombre AS servicio,
  s.total_camas,
  COUNT(DISTINCT p.id) FILTER (WHERE p.estado = 'ACTIVO') AS camas_ocupadas,
  s.total_camas - COUNT(DISTINCT p.id) FILTER (WHERE p.estado = 'ACTIVO') AS camas_disponibles,
  ROUND(
    (COUNT(DISTINCT p.id) FILTER (WHERE p.estado = 'ACTIVO')::DECIMAL / NULLIF(s.total_camas, 0)) * 100,
    2
  ) AS porcentaje_ocupacion,
  s.orden
FROM servicios s
LEFT JOIN subservicios sub ON sub.servicio_id = s.id
LEFT JOIN camas c ON c.subservicio_id = sub.id
LEFT JOIN pacientes p ON p.cama_id = c.id AND p.estado = 'ACTIVO'
GROUP BY s.id, s.codigo, s.nombre, s.total_camas, s.orden
ORDER BY s.orden;

-- ------------------------------------------------------------
-- 13. VISTA DE CAMAS CON OCUPANTE
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_camas_estado AS
SELECT
  c.id AS cama_id,
  s.id AS servicio_id,
  s.nombre AS servicio,
  sub.id AS subservicio_id,
  sub.nombre AS subservicio,
  c.numero_cama,
  p.id AS paciente_id,
  p.nombre_paciente,
  p.edad,
  p.genero,
  p.fecha_ingreso,
  p.hora_ingreso,
  p.diagnostico_ingreso,
  p.estado,
  CASE WHEN p.id IS NULL THEN 'DISPONIBLE' ELSE 'OCUPADA' END AS estado_cama
FROM camas c
JOIN subservicios sub ON sub.id = c.subservicio_id
JOIN servicios s ON s.id = sub.servicio_id
LEFT JOIN pacientes p ON p.cama_id = c.id AND p.estado = 'ACTIVO'
WHERE c.activa = TRUE
ORDER BY s.orden, sub.orden, c.numero_cama;

-- ============================================================
-- FIN DEL ESQUEMA
-- Total: 200 camas distribuidas en 20 subservicios de 10 servicios
-- ============================================================
