-- ============================================================
-- 70_control_dias_estancia.sql
-- El Formato de Control muestra, bajo el diagnóstico, los días de
-- estancia hospitalaria del paciente. La vista v_control_servicio no
-- exponía fecha_ingreso, así que la recreamos agregando:
--   - fecha_ingreso (cruda, reutilizable)
--   - dias_estancia: días transcurridos desde el ingreso, calculados
--     en hora local del hospital (America/Mazatlan, UTC-7). Para un
--     paciente ingresado hoy = 0 (misma convención que el cálculo de
--     egreso en ModalEgreso).
-- CREATE OR REPLACE solo permite APPEND al final, por eso se reproduce
-- la lista de columnas existente y se agregan las dos nuevas al final.
-- Idempotente.
-- ============================================================

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
  sub.nombre_completo AS subservicio_completo,
  -- NUEVO:
  p.fecha_ingreso,
  ((NOW() AT TIME ZONE 'America/Mazatlan')::date - p.fecha_ingreso) AS dias_estancia
FROM pacientes p
JOIN camas c ON c.id = p.cama_id
JOIN subservicios sub ON sub.id = c.subservicio_id
LEFT JOIN formato_control_paciente fc ON fc.paciente_id = p.id
WHERE p.estado = 'ACTIVO';

-- POST-CHECK
SELECT paciente_id, nombre_paciente, fecha_ingreso, dias_estancia
FROM v_control_servicio
ORDER BY dias_estancia DESC
LIMIT 10;
