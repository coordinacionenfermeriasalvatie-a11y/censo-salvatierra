-- ============================================================
-- LIMPIEZA: 96 pacientes de prueba (ingresados 2026-05-21)
--
-- Borra en cascada todo lo asociado:
--   - evento_apoyo_paciente
--   - dietas
--   - recetario
--   - formato_control_paciente (UI actual)
--   - formato_control (tabla legacy, si existe)
--   - historicos_egresos
--   - productividad_capturas (solo origen AUTO_*)
--   - finalmente pacientes
--
-- NO toca: auditoria (registro_id queda como huella historica),
--          MANUAL en productividad_capturas (capturas reales).
--
-- DRY-RUN POR DEFECTO: termina con ROLLBACK.
-- Para APLICAR DE VERDAD, cambia 'ROLLBACK;' por 'COMMIT;' al final.
-- ============================================================

BEGIN;

-- 1) Identificar targets
CREATE TEMP TABLE _target_pacientes ON COMMIT DROP AS
SELECT id FROM pacientes
WHERE estado = 'ACTIVO'
  AND fecha_ingreso = '2026-05-21';

-- 2) Conteo PRE-borrado
SELECT 'PRE-DELETE' AS fase,
  (SELECT COUNT(*) FROM _target_pacientes)
    AS pacientes_target,
  (SELECT COUNT(*) FROM evento_apoyo_paciente
   WHERE paciente_id IN (SELECT id FROM _target_pacientes))
    AS eventos_a_borrar,
  (SELECT COUNT(*) FROM dietas
   WHERE paciente_id IN (SELECT id FROM _target_pacientes))
    AS dietas_a_borrar,
  (SELECT COUNT(*) FROM recetario
   WHERE paciente_id IN (SELECT id FROM _target_pacientes))
    AS recetas_a_borrar;

-- 3) Cascade en orden de dependencia

-- 3.1 evento_apoyo_paciente
DELETE FROM evento_apoyo_paciente
WHERE paciente_id IN (SELECT id FROM _target_pacientes);

-- 3.2 dietas
DELETE FROM dietas
WHERE paciente_id IN (SELECT id FROM _target_pacientes);

-- 3.3 recetario
DELETE FROM recetario
WHERE paciente_id IN (SELECT id FROM _target_pacientes);

-- 3.4 formato_control_paciente (tabla actual; solo si existe)
DO $$
BEGIN
  IF to_regclass('public.formato_control_paciente') IS NOT NULL THEN
    EXECUTE 'DELETE FROM formato_control_paciente WHERE paciente_id IN (SELECT id FROM _target_pacientes)';
  END IF;
END $$;

-- 3.5 formato_control (tabla legacy del schema 01; solo si existe)
DO $$
BEGIN
  IF to_regclass('public.formato_control') IS NOT NULL THEN
    EXECUTE 'DELETE FROM formato_control WHERE paciente_id IN (SELECT id FROM _target_pacientes)';
  END IF;
END $$;

-- 3.6 historicos_egresos (no FK formal pero limpiamos para coherencia)
DELETE FROM historicos_egresos
WHERE paciente_id IN (SELECT id FROM _target_pacientes);

-- 3.7 productividad_capturas (solo AUTO_*; preservamos MANUAL)
DELETE FROM productividad_capturas
WHERE origen LIKE 'AUTO_%';

-- 3.8 Finalmente, pacientes
DELETE FROM pacientes
WHERE id IN (SELECT id FROM _target_pacientes);

-- 4) Conteo POST-borrado
SELECT 'POST-DELETE' AS fase,
  (SELECT COUNT(*) FROM pacientes WHERE estado='ACTIVO')
    AS pacientes_activos_restantes,
  (SELECT COUNT(*) FROM evento_apoyo_paciente)
    AS eventos_restantes,
  (SELECT COUNT(*) FROM dietas)
    AS dietas_restantes,
  (SELECT COUNT(*) FROM recetario)
    AS recetas_restantes,
  (SELECT COUNT(*) FROM productividad_capturas WHERE origen LIKE 'AUTO_%')
    AS productividad_auto_restante,
  (SELECT COUNT(*) FROM productividad_capturas WHERE origen = 'MANUAL')
    AS productividad_manual_preservada;

-- ============================================================
-- ⚠️ MODO APLICAR: COMMIT esta activo.
-- Si quieres volver a dry-run, descomenta ROLLBACK y comenta COMMIT.
-- ============================================================
-- ROLLBACK;
COMMIT;
