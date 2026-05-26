-- ============================================================
-- Migración 22: Exponer alergias y grupo sanguíneo en v_camas_estado
-- ============================================================
-- Permite que la pestaña Censo muestre un chip ⚠️ ALERGIA junto a la
-- cama cuando el paciente tiene alergias capturadas (seguridad clínica
-- al primer vistazo) y que el grupo y RH esté disponible sin un JOIN
-- adicional desde React.
--
-- La migración 21 ya agregó pacientes.grupo_sanguineo / pacientes.alergias.
-- Esta migración solo recrea la vista.
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
  p.estado,
  CASE
    WHEN p.id IS NULL THEN 'DISPONIBLE'::text
    ELSE 'OCUPADA'::text
  END                         AS estado_cama
FROM camas c
JOIN subservicios sub ON sub.id = c.subservicio_id
JOIN servicios s    ON s.id    = sub.servicio_id
LEFT JOIN pacientes p ON p.cama_id = c.id AND p.estado = 'ACTIVO'
WHERE c.activa = TRUE;

COMMENT ON VIEW v_camas_estado IS
  'Camas + paciente activo (si existe) con grupo sanguíneo y alergias para mostrar chip de seguridad en la pestaña Censo.';

-- POST-CHECK
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'v_camas_estado'
 ORDER BY ordinal_position;
