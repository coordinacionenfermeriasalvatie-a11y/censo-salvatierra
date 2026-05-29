-- ============================================================
-- Migración 63: excluir REPOSETS de Dietas y Recetario
-- ============================================================
-- Los reposets de Oncología Pediátrica (mig 62, tipo_cama='REPOSET')
-- son para quimioterapias ambulatorias. SÍ generan censo, control y
-- productividad, pero NO deben aparecer en la hoja de Dietas ni en el
-- Recetario.
--
-- El filtro es POR tipo_cama='REPOSET', NO por es_censable: las cunas
-- (tipo_cama='CUNA') y las camillas no censables deben seguir saliendo
-- en Dietas y Recetario con normalidad. Por eso se usa
--   c.tipo_cama IS DISTINCT FROM 'REPOSET'
-- que mantiene NULL (camas normales) y 'CUNA', y solo descarta 'REPOSET'.
--
-- Ambas son CREATE OR REPLACE sin tocar la lista de columnas (solo se
-- agrega el filtro en el WHERE), por lo que son compatibles con la vista
-- existente. Idempotente.
--
-- NOTA si v_recetario_servicio diera error "cannot drop columns" /
-- "cannot change name of view column": la vista en producción derivó del
-- repo. En ese caso envía la salida de
--   SELECT pg_get_viewdef('public.v_recetario_servicio', true);
-- y la alineo. La definición de abajo replica la migración 43.
-- ============================================================

-- 1) Dietas — replica la definición de producción (usa dietas_paciente)
--    + filtro de reposets.
CREATE OR REPLACE VIEW public.v_dietas_servicio AS
SELECT p.id            AS paciente_id,
       s.servicio_id,
       s.id            AS subservicio_id,
       s.nombre        AS subservicio,
       c.numero_cama,
       p.nombre_paciente,
       p.edad,
       p.genero,
       p.nss_curp,
       d.id            AS dieta_id,
       d.tipo_dieta,
       d.consistencia,
       d.restricciones,
       d.observaciones,
       d.actualizado_en
FROM pacientes p
  JOIN dietas_paciente d ON d.paciente_id = p.id
  JOIN camas c           ON c.id = p.cama_id
  JOIN subservicios s    ON s.id = c.subservicio_id
WHERE p.estado = 'ACTIVO'::text
  AND c.tipo_cama IS DISTINCT FROM 'REPOSET';

-- 2) Recetario — replica la definición de migración 43 + filtro de reposets.
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
WHERE p.estado = 'ACTIVO'
  AND c.tipo_cama IS DISTINCT FROM 'REPOSET';
