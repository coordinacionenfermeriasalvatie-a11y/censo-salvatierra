-- ============================================================
-- Migración 21: Grupo sanguíneo, alergias y escala del dolor
-- ============================================================
-- Agrega 3 campos clínicos persistentes para alimentar la
-- Tarjeta de Identificación impresa (/imprimir/ficha/:pacienteId)
-- sin tener que llenarlos a mano en cada papel.
--
-- - pacientes.grupo_sanguineo   (TEXT, con CHECK)
-- - pacientes.alergias          (TEXT libre)
-- - formato_control_paciente.dolor_escala       (SMALLINT 0..10)
-- - formato_control_paciente.dolor_evaluado_en  (TIMESTAMPTZ)
--
-- Y extiende v_control_servicio para que la UI los lea sin un
-- segundo JOIN.
-- ============================================================

-- 1) Columnas (idempotente: ya se aplicaron a la BD, esto las deja documentadas)
ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS grupo_sanguineo TEXT,
  ADD COLUMN IF NOT EXISTS alergias        TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_grupo_sanguineo') THEN
    ALTER TABLE pacientes ADD CONSTRAINT ck_grupo_sanguineo
      CHECK (grupo_sanguineo IS NULL OR grupo_sanguineo IN
        ('A+','A-','B+','B-','AB+','AB-','O+','O-','DESCONOCIDO'));
  END IF;
END $$;

ALTER TABLE formato_control_paciente
  ADD COLUMN IF NOT EXISTS dolor_escala       SMALLINT,
  ADD COLUMN IF NOT EXISTS dolor_evaluado_en  TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_dolor_escala') THEN
    ALTER TABLE formato_control_paciente ADD CONSTRAINT ck_dolor_escala
      CHECK (dolor_escala IS NULL OR (dolor_escala >= 0 AND dolor_escala <= 10));
  END IF;
END $$;

-- 2) Recrear v_control_servicio con las nuevas columnas
-- DROP necesario: CREATE OR REPLACE no permite reordenar columnas existentes.
DROP VIEW IF EXISTS v_control_servicio;
CREATE VIEW v_control_servicio AS
SELECT
  p.id                       AS paciente_id,
  sub.servicio_id            AS servicio_id,
  sub.nombre                 AS subservicio,
  c.numero_cama              AS numero_cama,
  p.nombre_paciente          AS nombre_paciente,
  p.edad                     AS edad,
  p.genero                   AS genero,
  p.nss_curp                 AS nss_curp,
  p.diagnostico_ingreso      AS diagnostico_ingreso,
  p.grupo_sanguineo          AS grupo_sanguineo,
  p.alergias                 AS alergias,
  fc.riesgo_upp              AS riesgo_upp,
  fc.riesgo_caidas           AS riesgo_caidas,
  fc.causa_no_ocupacion      AS causa_no_ocupacion,
  fc.traslado                AS traslado,
  fc.observaciones           AS observaciones,
  fc.dolor_escala            AS dolor_escala,
  fc.dolor_evaluado_en       AS dolor_evaluado_en
FROM pacientes p
JOIN camas c              ON c.id   = p.cama_id
JOIN subservicios sub     ON sub.id = c.subservicio_id
LEFT JOIN formato_control_paciente fc ON fc.paciente_id = p.id
WHERE p.estado = 'ACTIVO';

COMMENT ON VIEW v_control_servicio IS
  'Pacientes ACTIVO con datos de formato_control_paciente + grupo_sanguineo/alergias/escala_dolor para Tarjeta de Identificación.';

-- 3) POST-CHECK
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'v_control_servicio'
 ORDER BY ordinal_position;
