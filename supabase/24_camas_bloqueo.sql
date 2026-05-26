-- ============================================================
-- Migración 24: Bloqueo de camas no ocupables (sin paciente)
-- ============================================================
-- Hasta ahora la causa_no_ocupacion vivía en formato_control_paciente,
-- lo que requería un INGRESO de paciente. Eso obligaba a "ingresar un
-- paciente fantasma" para marcar que una cama no se podía ocupar
-- (descompuesta, sin colchón, en reparación, etc.).
--
-- Esta migración mueve el concepto al nivel correcto (la CAMA en sí)
-- para que cualquier cama vacía se pueda bloquear con su causa sin
-- requerir un paciente.
-- ============================================================

-- 1) Columnas de bloqueo en camas
ALTER TABLE camas
  ADD COLUMN IF NOT EXISTS bloqueada BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS causa_no_ocupacion TEXT,
  ADD COLUMN IF NOT EXISTS nota_no_ocupacion TEXT,
  ADD COLUMN IF NOT EXISTS bloqueada_desde TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bloqueada_por UUID REFERENCES perfiles(id);

-- 2) CHECK: causa válida cuando hay bloqueo
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_camas_causa_no_ocupacion') THEN
    ALTER TABLE camas ADD CONSTRAINT ck_camas_causa_no_ocupacion
      CHECK (
        bloqueada = FALSE
        OR causa_no_ocupacion IN ('SIN CAMA', 'DESCOMPUESTA', 'SIN COLCHÓN', 'EN REPARACIÓN', 'OTRA')
      );
  END IF;
END $$;

-- 3) Recrear v_camas_estado para exponer el bloqueo y nuevo estado_cama
DROP VIEW IF EXISTS v_camas_estado;

CREATE VIEW v_camas_estado AS
SELECT
  c.id                        AS cama_id,
  s.id                        AS servicio_id,
  s.nombre                    AS servicio,
  sub.id                      AS subservicio_id,
  sub.nombre                  AS subservicio,
  sub.orden                   AS subservicio_orden,
  c.numero_cama,
  CASE
    WHEN c.numero_cama ~ '^[0-9]+$'::text THEN lpad(c.numero_cama, 4, '0'::text)
    ELSE c.numero_cama
  END                         AS numero_cama_sort,
  COALESCE(c.es_censable, TRUE) AS es_censable,
  p.id                        AS paciente_id,
  p.nombre_paciente,
  p.edad,
  p.genero,
  p.fecha_ingreso,
  p.hora_ingreso,
  p.diagnostico_ingreso,
  p.grupo_sanguineo,
  p.alergias,
  fc.riesgo_caidas,
  fc.riesgo_upp,
  p.estado,
  c.bloqueada                 AS cama_bloqueada,
  c.causa_no_ocupacion        AS cama_causa_no_ocupacion,
  c.nota_no_ocupacion         AS cama_nota_no_ocupacion,
  c.bloqueada_desde           AS cama_bloqueada_desde,
  CASE
    WHEN p.id IS NOT NULL THEN 'OCUPADA'::text
    WHEN c.bloqueada           THEN 'NO_OCUPABLE'::text
    ELSE 'DISPONIBLE'::text
  END                         AS estado_cama
FROM camas c
JOIN subservicios sub ON sub.id = c.subservicio_id
JOIN servicios s    ON s.id    = sub.servicio_id
LEFT JOIN pacientes p ON p.cama_id = c.id AND p.estado = 'ACTIVO'
LEFT JOIN formato_control_paciente fc ON fc.paciente_id = p.id
WHERE c.activa = TRUE;

COMMENT ON VIEW v_camas_estado IS
  'Camas + paciente activo (si existe) + estado de bloqueo (sin paciente). estado_cama puede ser OCUPADA, NO_OCUPABLE o DISPONIBLE.';

-- 4) POST-CHECK
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'v_camas_estado'
 ORDER BY ordinal_position;

SELECT bloqueada, causa_no_ocupacion, COUNT(*) FROM camas GROUP BY bloqueada, causa_no_ocupacion;
