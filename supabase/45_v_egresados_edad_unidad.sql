-- ============================================================
-- Migración 45: v_egresados_servicio expone edad_unidad
-- ============================================================
-- La pestaña Censo > Egresados Recientes muestra la edad de cada
-- paciente egresado. Sin esta columna se imprimía siempre "X años"
-- aunque el paciente fuera un neonato (DIAS) o lactante (MESES).
-- ============================================================

CREATE OR REPLACE VIEW public.v_egresados_servicio AS
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
  p.fecha_ingreso,
  p.hora_ingreso,
  p.fecha_egreso,
  p.hora_egreso,
  p.dias_estancia,
  p.destino_egreso,
  p.observaciones,
  p.motivo_egreso_id,
  me.nombre AS motivo_nombre,
  per.nombre_completo AS egresado_por_nombre,
  p.edad_unidad
FROM pacientes p
JOIN camas c ON c.id = p.cama_id
JOIN subservicios ss ON ss.id = c.subservicio_id
JOIN servicios s ON s.id = ss.servicio_id
LEFT JOIN catalogo_motivos_egreso me ON me.id = p.motivo_egreso_id
LEFT JOIN perfiles per ON per.id = p.egresado_por
WHERE p.estado = 'EGRESADO'::text;
