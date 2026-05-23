-- ============================================================
-- RESET TOTAL: censo, productividad, egresos a 0
--
-- Borra TODO lo histórico para arrancar fresco con enfermeras reales.
-- Incluye:
--   - Pacientes (ACTIVO + EGRESADO + TRASLADADO — sin filtros)
--   - evento_apoyo_paciente
--   - dietas, recetario
--   - formato_control_paciente, formato_control (legacy si existe)
--   - historicos_egresos
--   - productividad_capturas (TODOS los origenes, incluido MANUAL)
--
-- NO toca (se preservan):
--   - catalogos (motivos_egreso, indicadores_productividad, especialidades, etc.)
--   - perfiles, auth.users
--   - servicios, subservicios, camas
--   - auditoria (huella histórica de operaciones)
--
-- DRY-RUN POR DEFECTO. Cambia ROLLBACK por COMMIT al final para aplicar.
-- ============================================================

BEGIN;

-- 1) Snapshot de IDs (todos los pacientes en DB)
CREATE TEMP TABLE _target_pacientes ON COMMIT DROP AS
SELECT id, estado, fecha_ingreso, fecha_egreso FROM pacientes;

-- 2) Conteo PRE-borrado
SELECT 'PRE-DELETE' AS fase,
  (SELECT COUNT(*) FROM _target_pacientes)                              AS pacientes_total,
  (SELECT COUNT(*) FROM _target_pacientes WHERE estado = 'ACTIVO')      AS pacientes_activos,
  (SELECT COUNT(*) FROM _target_pacientes WHERE estado = 'EGRESADO')    AS pacientes_egresados,
  (SELECT COUNT(*) FROM _target_pacientes WHERE estado = 'TRASLADADO')  AS pacientes_trasladados,
  (SELECT COUNT(*) FROM evento_apoyo_paciente)                          AS eventos_total,
  (SELECT COUNT(*) FROM dietas)                                          AS dietas_total,
  (SELECT COUNT(*) FROM recetario)                                       AS recetas_total,
  (SELECT COUNT(*) FROM productividad_capturas)                         AS productividad_total,
  (SELECT COUNT(*) FROM productividad_capturas WHERE origen = 'MANUAL') AS productividad_manual,
  (SELECT COUNT(*) FROM historicos_egresos)                             AS historicos_total;

-- ============================================================
-- 3) Cascade en orden de dependencia
-- ============================================================

-- 3.1 evento_apoyo_paciente
DELETE FROM evento_apoyo_paciente
WHERE paciente_id IN (SELECT id FROM _target_pacientes);

-- 3.2 dietas
DELETE FROM dietas
WHERE paciente_id IN (SELECT id FROM _target_pacientes);

-- 3.3 recetario
DELETE FROM recetario
WHERE paciente_id IN (SELECT id FROM _target_pacientes);

-- 3.4 formato_control_paciente
DO $$
BEGIN
  IF to_regclass('public.formato_control_paciente') IS NOT NULL THEN
    EXECUTE 'DELETE FROM formato_control_paciente WHERE paciente_id IN (SELECT id FROM _target_pacientes)';
  END IF;
END $$;

-- 3.5 formato_control (legacy)
DO $$
BEGIN
  IF to_regclass('public.formato_control') IS NOT NULL THEN
    EXECUTE 'DELETE FROM formato_control WHERE paciente_id IN (SELECT id FROM _target_pacientes)';
  END IF;
END $$;

-- 3.6 historicos_egresos (TODO)
DELETE FROM historicos_egresos;

-- 3.7 productividad_capturas (TODO, incluido MANUAL)
DELETE FROM productividad_capturas;

-- 3.8 pacientes (TODOS)
DELETE FROM pacientes;

-- ============================================================
-- 4) Conteo POST-borrado
-- ============================================================
SELECT 'POST-DELETE' AS fase,
  (SELECT COUNT(*) FROM pacientes)                  AS pacientes_restantes,
  (SELECT COUNT(*) FROM evento_apoyo_paciente)      AS eventos_restantes,
  (SELECT COUNT(*) FROM dietas)                     AS dietas_restantes,
  (SELECT COUNT(*) FROM recetario)                  AS recetas_restantes,
  (SELECT COUNT(*) FROM productividad_capturas)     AS productividad_restante,
  (SELECT COUNT(*) FROM historicos_egresos)         AS historicos_restantes,
  -- Verificaciones de catalogos (deben quedar intactos)
  (SELECT COUNT(*) FROM catalogo_indicadores_productividad) AS indicadores_catalogo_preservados,
  (SELECT COUNT(*) FROM catalogo_motivos_egreso)            AS motivos_egreso_preservados,
  (SELECT COUNT(*) FROM perfiles)                            AS perfiles_preservados,
  (SELECT COUNT(*) FROM camas)                               AS camas_preservadas;

-- ============================================================
-- ⚠️ DRY-RUN: NO se aplican cambios.
-- Verifica que POST-DELETE muestre todos los conteos clinicos en 0
-- y los catalogos/perfiles/camas preservados (>0).
-- Cuando estes conforme, cambia ROLLBACK por COMMIT y vuelve a correr.
-- ============================================================
-- ROLLBACK;
COMMIT;
