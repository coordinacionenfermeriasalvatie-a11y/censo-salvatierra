-- ============================================================
-- VISTA DE COMPLETITUD POR PACIENTE
-- Trazabilidad: para cada paciente ACTIVO, indica si tiene
-- registro en cada hoja satelite (dietas, recetario, control).
--
-- Modelo de datos real:
--   dietas_paciente            - 1 fila por paciente (UPDATE)
--   recetario_medicamentos     - N filas por paciente (INSERT)
--   formato_control_paciente   - 1 fila por paciente (UPDATE)
-- No hay columna "fecha" en ninguna; la completitud es por
-- existencia/valor, no por dia.
-- ============================================================

DROP VIEW IF EXISTS v_paciente_completitud_dia;

CREATE VIEW v_paciente_completitud_dia AS
SELECT
  p.id      AS paciente_id,
  p.cama_id,
  EXISTS (
    SELECT 1 FROM dietas_paciente dp
    WHERE dp.paciente_id = p.id
      AND dp.tipo_dieta IS NOT NULL
  ) AS tiene_dieta,
  EXISTS (
    SELECT 1 FROM recetario_medicamentos rm
    WHERE rm.paciente_id = p.id
  ) AS tiene_receta,
  EXISTS (
    SELECT 1 FROM formato_control_paciente fc
    WHERE fc.paciente_id = p.id
      AND fc.actualizado_por IS NOT NULL
  ) AS tiene_control
FROM pacientes p
WHERE p.estado = 'ACTIVO';

COMMENT ON VIEW v_paciente_completitud_dia IS
  'Trazabilidad por paciente activo: 3 booleanos (dieta/receta/control). Una fila por paciente ACTIVO. Apunta a dietas_paciente, recetario_medicamentos, formato_control_paciente.';
