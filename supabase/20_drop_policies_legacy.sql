-- ============================================================
-- LIMPIEZA DE POLICIES RLS LEGACY
--
-- Las policies "permisivas" creadas en versiones anteriores conviven
-- con las nuevas (p_*) y las bypassean (PostgreSQL evalua OR de todas
-- las policies del mismo cmd).
--
-- Este script elimina solo las legacy. Las nuevas (p_*) quedan.
--
-- Idempotente. DROP POLICY IF EXISTS no falla si la policy no existe.
-- ============================================================

-- DIETAS
DROP POLICY IF EXISTS lectura_autenticados_dietas    ON dietas;
DROP POLICY IF EXISTS insercion_autenticados_dietas  ON dietas;

-- RECETARIO
DROP POLICY IF EXISTS lectura_autenticados_recetario   ON recetario;
DROP POLICY IF EXISTS insercion_autenticados_recetario ON recetario;

-- PACIENTES (legacy abiertas)
DROP POLICY IF EXISTS insercion_autenticados_pacientes  ON pacientes;
DROP POLICY IF EXISTS actualizar_no_sellado_pacientes   ON pacientes;
DROP POLICY IF EXISTS pol_pacientes_select              ON pacientes;
DROP POLICY IF EXISTS pol_pacientes_insert              ON pacientes;
DROP POLICY IF EXISTS pol_pacientes_update              ON pacientes;
DROP POLICY IF EXISTS pol_pacientes_delete              ON pacientes;

-- FORMATO_CONTROL_PACIENTE
DROP POLICY IF EXISTS auth_select_control  ON formato_control_paciente;
DROP POLICY IF EXISTS auth_insert_control  ON formato_control_paciente;
DROP POLICY IF EXISTS auth_update_control  ON formato_control_paciente;

-- HISTORICOS_EGRESOS
DROP POLICY IF EXISTS lectura_historicos     ON historicos_egresos;
DROP POLICY IF EXISTS insercion_historicos   ON historicos_egresos;

-- PRODUCTIVIDAD_CAPTURAS
DROP POLICY IF EXISTS pol_prod_read    ON productividad_capturas;
DROP POLICY IF EXISTS pol_prod_insert  ON productividad_capturas;
DROP POLICY IF EXISTS pol_prod_update  ON productividad_capturas;

-- PERFILES
DROP POLICY IF EXISTS lectura_autenticados_perfiles  ON perfiles;
DROP POLICY IF EXISTS lectura_perfil_propio          ON perfiles;

-- ASIGNACIONES_ENFERMERO_TURNO (legacy)
DROP POLICY IF EXISTS pol_asig_select_all     ON asignaciones_enfermero_turno;
DROP POLICY IF EXISTS pol_asig_insert_jefe    ON asignaciones_enfermero_turno;
DROP POLICY IF EXISTS pol_asig_update_jefe    ON asignaciones_enfermero_turno;
DROP POLICY IF EXISTS pol_asig_delete_jefe    ON asignaciones_enfermero_turno;

-- ============================================================
-- VERIFICACION: lista solo las policies que QUEDAN
-- Debe haber unicamente las p_* (las nuevas)
-- ============================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'pacientes', 'evento_apoyo_paciente', 'dietas', 'recetario',
    'formato_control_paciente', 'productividad_capturas',
    'historicos_egresos', 'perfiles', 'asignaciones_enfermero_turno'
  )
ORDER BY tablename, policyname;
