-- ============================================================
-- Migración 23: Trazabilidad de Riesgos en v_camas_estado
-- ============================================================
-- riesgo_caidas y riesgo_upp se capturan en el modal de Ingreso (Censo)
-- y se guardan en formato_control_paciente. Para que la tarjeta de la
-- cama muestre chips de los riesgos sin un segundo JOIN, extendemos la
-- vista con LEFT JOIN a formato_control_paciente.
-- ============================================================

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
  CASE
    WHEN p.id IS NULL THEN 'DISPONIBLE'::text
    ELSE 'OCUPADA'::text
  END                         AS estado_cama
FROM camas c
JOIN subservicios sub ON sub.id = c.subservicio_id
JOIN servicios s    ON s.id    = sub.servicio_id
LEFT JOIN pacientes p ON p.cama_id = c.id AND p.estado = 'ACTIVO'
LEFT JOIN formato_control_paciente fc ON fc.paciente_id = p.id
WHERE c.activa = TRUE;

COMMENT ON VIEW v_camas_estado IS
  'Camas + paciente activo (si existe) con grupo, alergias y riesgos (caídas/UPP) para chips de seguridad en la pestaña Censo.';

-- POST-CHECK
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'v_camas_estado'
 ORDER BY ordinal_position;
