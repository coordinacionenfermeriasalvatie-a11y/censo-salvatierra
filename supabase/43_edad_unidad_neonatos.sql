-- ============================================================
-- Migración 43: edad_unidad para neonatos en UCIN/UTIP/UTIN
-- ============================================================
-- Los pacientes neonatales (UCIN sobre todo) tienen edad en DÍAS o
-- MESES, no en años. Antes la columna `edad` solo aceptaba un entero
-- y se asumía AÑOS. Ahora se acompaña con `edad_unidad`.
-- ============================================================

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS edad_unidad TEXT NOT NULL DEFAULT 'AÑOS'
  CHECK (edad_unidad IN ('AÑOS','MESES','DIAS'));

COMMENT ON COLUMN pacientes.edad_unidad IS
  'Unidad de la edad numérica: AÑOS (default), MESES o DIAS (neonatos).';

-- Recrear v_camas_estado para exponer edad_unidad
-- (CREATE OR REPLACE solo permite APPEND al final → append edad_unidad).
CREATE OR REPLACE VIEW public.v_camas_estado AS
SELECT
  c.id AS cama_id,
  s.id AS servicio_id,
  s.nombre AS servicio,
  sub.id AS subservicio_id,
  sub.nombre AS subservicio,
  sub.orden AS subservicio_orden,
  c.numero_cama,
  CASE
    WHEN c.numero_cama ~ '^[0-9]+$'        THEN lpad(c.numero_cama, 4, '0')
    WHEN c.numero_cama ~ '^[0-9]+[A-Za-z]+$' THEN lpad(substring(c.numero_cama, '^[0-9]+'), 4, '0') || upper(substring(c.numero_cama, '[A-Za-z]+$'))
    ELSE c.numero_cama
  END AS numero_cama_sort,
  COALESCE(c.es_censable, TRUE) AS es_censable,
  p.id AS paciente_id,
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
  c.bloqueada AS cama_bloqueada,
  c.causa_no_ocupacion AS cama_causa_no_ocupacion,
  c.nota_no_ocupacion AS cama_nota_no_ocupacion,
  c.bloqueada_desde AS cama_bloqueada_desde,
  CASE
    WHEN p.id IS NOT NULL THEN 'OCUPADA'
    WHEN c.bloqueada THEN 'NO_OCUPABLE'
    ELSE 'DISPONIBLE'
  END AS estado_cama,
  sub.nombre_completo AS subservicio_completo,
  p.edad_unidad
FROM camas c
JOIN subservicios sub ON sub.id = c.subservicio_id
JOIN servicios s ON s.id = sub.servicio_id
LEFT JOIN pacientes p ON p.cama_id = c.id AND p.estado = 'ACTIVO'
LEFT JOIN formato_control_paciente fc ON fc.paciente_id = p.id
WHERE c.activa = TRUE;

-- Recrear v_control_servicio para exponer edad_unidad (append al final)
CREATE OR REPLACE VIEW public.v_control_servicio AS
SELECT
  p.id AS paciente_id,
  sub.servicio_id,
  sub.nombre AS subservicio,
  c.numero_cama,
  p.nombre_paciente,
  p.edad,
  p.genero,
  p.nss_curp,
  p.diagnostico_ingreso,
  p.grupo_sanguineo,
  p.alergias,
  fc.riesgo_upp,
  fc.riesgo_caidas,
  fc.causa_no_ocupacion,
  fc.traslado,
  fc.observaciones,
  fc.dolor_escala,
  fc.dolor_evaluado_en,
  p.fecha_nacimiento,
  p.edad_unidad,
  sub.orden AS subservicio_orden,
  sub.nombre_completo AS subservicio_completo
FROM pacientes p
JOIN camas c ON c.id = p.cama_id
JOIN subservicios sub ON sub.id = c.subservicio_id
LEFT JOIN formato_control_paciente fc ON fc.paciente_id = p.id
WHERE p.estado = 'ACTIVO';

-- Recrear v_recetario_servicio incluyendo edad_unidad y subservicio_orden
-- (la columna subservicio ya está; agregamos las nuevas al final).
CREATE OR REPLACE VIEW public.v_recetario_servicio AS
SELECT
  p.id AS paciente_id,
  s.id AS servicio_id,
  s.codigo AS servicio_codigo,
  ss.nombre AS subservicio,
  c.numero_cama,
  p.nombre_paciente,
  p.edad,
  p.genero,
  p.nss_curp,
  p.diagnostico_ingreso,
  p.estado AS paciente_estado,
  rm.id AS medicamento_id,
  rm.orden,
  rm.medicamento,
  rm.dosis,
  rm.via,
  rm.frecuencia,
  rm.solicitada,
  rm.dispensada,
  rm.creado_en,
  rm.actualizado_en,
  p.edad_unidad,
  ss.orden AS subservicio_orden,
  ss.nombre_completo AS subservicio_completo
FROM pacientes p
JOIN camas c                          ON c.id = p.cama_id
JOIN subservicios ss                  ON ss.id = c.subservicio_id
JOIN servicios s                      ON s.id = ss.servicio_id
LEFT JOIN recetario_medicamentos rm   ON rm.paciente_id = p.id
WHERE p.estado = 'ACTIVO';
