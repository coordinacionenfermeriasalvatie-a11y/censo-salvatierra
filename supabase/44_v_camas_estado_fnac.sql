-- ============================================================
-- Migración 44: v_camas_estado expone fecha_nacimiento + servicio_codigo
-- ============================================================
-- Necesario para que la vista censo pueda calcular la edad en días para
-- pacientes de Pediatría (UCIN, UTIN, UTIP, CYD, etc.) — los neonatos
-- y lactantes se siguen en días aunque su edad capturada sea en MESES
-- o AÑOS.
-- ============================================================

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
  p.edad_unidad,
  p.fecha_nacimiento,
  s.codigo AS servicio_codigo
FROM camas c
JOIN subservicios sub ON sub.id = c.subservicio_id
JOIN servicios s ON s.id = sub.servicio_id
LEFT JOIN pacientes p ON p.cama_id = c.id AND p.estado = 'ACTIVO'
LEFT JOIN formato_control_paciente fc ON fc.paciente_id = p.id
WHERE c.activa = TRUE;
