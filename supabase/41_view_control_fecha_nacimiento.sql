-- ============================================================
-- Migración 41: v_control_servicio incluye fecha_nacimiento
-- ============================================================
-- La hoja de Control muestra la fecha de nacimiento junto al nombre,
-- útil para identificar al paciente sin confiar solo en la edad.
-- ============================================================

-- CREATE OR REPLACE VIEW no permite insertar columnas en el medio,
-- así que agregamos fecha_nacimiento AL FINAL para preservar el orden
-- existente y no romper consumidores que tomen columnas posicionalmente.
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
  p.fecha_nacimiento
FROM pacientes p
JOIN camas c            ON c.id = p.cama_id
JOIN subservicios sub   ON sub.id = c.subservicio_id
LEFT JOIN formato_control_paciente fc ON fc.paciente_id = p.id
WHERE p.estado = 'ACTIVO';
