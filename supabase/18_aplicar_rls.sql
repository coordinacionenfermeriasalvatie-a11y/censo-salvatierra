-- ============================================================
-- POLITICAS RLS POR ROL
--
-- jefe / subjefe / supervisor : todo el hospital
-- gestor / enfermera          : solo su servicio
--
-- Tablas afectadas:
--   pacientes
--   evento_apoyo_paciente
--   dietas
--   recetario
--   formato_control_paciente
--   productividad_capturas
--   historicos_egresos
--
-- Las policies usan los helpers de 17_helpers_rls.sql.
-- Idempotente: DROP POLICY IF EXISTS antes de CREATE.
-- ============================================================

-- ------------------------------------------------------------
-- PACIENTES
-- ------------------------------------------------------------
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_pacientes_select ON pacientes;
DROP POLICY IF EXISTS p_pacientes_insert ON pacientes;
DROP POLICY IF EXISTS p_pacientes_update ON pacientes;

CREATE POLICY p_pacientes_select ON pacientes
  FOR SELECT TO authenticated
  USING (fn_user_can_see_paciente(id));

CREATE POLICY p_pacientes_insert ON pacientes
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_user_can_write_servicio(fn_servicio_de_cama(cama_id))
    AND capturado_por = auth.uid()
  );

CREATE POLICY p_pacientes_update ON pacientes
  FOR UPDATE TO authenticated
  USING (fn_user_can_see_paciente(id))
  WITH CHECK (fn_user_can_see_paciente(id));

-- ------------------------------------------------------------
-- EVENTO_APOYO_PACIENTE
-- ------------------------------------------------------------
ALTER TABLE evento_apoyo_paciente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lectura_eventos_apoyo ON evento_apoyo_paciente;
DROP POLICY IF EXISTS insercion_eventos_apoyo ON evento_apoyo_paciente;
DROP POLICY IF EXISTS actualizacion_eventos_apoyo ON evento_apoyo_paciente;
DROP POLICY IF EXISTS p_evento_select ON evento_apoyo_paciente;
DROP POLICY IF EXISTS p_evento_insert ON evento_apoyo_paciente;
DROP POLICY IF EXISTS p_evento_update ON evento_apoyo_paciente;

CREATE POLICY p_evento_select ON evento_apoyo_paciente
  FOR SELECT TO authenticated
  USING (fn_user_can_see_paciente(paciente_id));

CREATE POLICY p_evento_insert ON evento_apoyo_paciente
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_user_can_see_paciente(paciente_id)
    AND capturado_por = auth.uid()
  );

CREATE POLICY p_evento_update ON evento_apoyo_paciente
  FOR UPDATE TO authenticated
  USING (fn_user_can_see_paciente(paciente_id))
  WITH CHECK (fn_user_can_see_paciente(paciente_id));

-- ------------------------------------------------------------
-- DIETAS
-- ------------------------------------------------------------
ALTER TABLE dietas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_dietas_select ON dietas;
DROP POLICY IF EXISTS p_dietas_insert ON dietas;
DROP POLICY IF EXISTS p_dietas_update ON dietas;

CREATE POLICY p_dietas_select ON dietas
  FOR SELECT TO authenticated
  USING (fn_user_can_see_paciente(paciente_id));

CREATE POLICY p_dietas_insert ON dietas
  FOR INSERT TO authenticated
  WITH CHECK (fn_user_can_see_paciente(paciente_id));

CREATE POLICY p_dietas_update ON dietas
  FOR UPDATE TO authenticated
  USING (fn_user_can_see_paciente(paciente_id))
  WITH CHECK (fn_user_can_see_paciente(paciente_id));

-- ------------------------------------------------------------
-- RECETARIO
-- ------------------------------------------------------------
ALTER TABLE recetario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_recetario_select ON recetario;
DROP POLICY IF EXISTS p_recetario_insert ON recetario;
DROP POLICY IF EXISTS p_recetario_update ON recetario;

CREATE POLICY p_recetario_select ON recetario
  FOR SELECT TO authenticated
  USING (fn_user_can_see_paciente(paciente_id));

CREATE POLICY p_recetario_insert ON recetario
  FOR INSERT TO authenticated
  WITH CHECK (fn_user_can_see_paciente(paciente_id));

CREATE POLICY p_recetario_update ON recetario
  FOR UPDATE TO authenticated
  USING (fn_user_can_see_paciente(paciente_id))
  WITH CHECK (fn_user_can_see_paciente(paciente_id));

-- ------------------------------------------------------------
-- FORMATO_CONTROL_PACIENTE
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.formato_control_paciente') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE formato_control_paciente ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_fcp_select ON formato_control_paciente';
    EXECUTE 'DROP POLICY IF EXISTS p_fcp_insert ON formato_control_paciente';
    EXECUTE 'DROP POLICY IF EXISTS p_fcp_update ON formato_control_paciente';
    EXECUTE $POL$
      CREATE POLICY p_fcp_select ON formato_control_paciente
        FOR SELECT TO authenticated
        USING (fn_user_can_see_paciente(paciente_id))
    $POL$;
    EXECUTE $POL$
      CREATE POLICY p_fcp_insert ON formato_control_paciente
        FOR INSERT TO authenticated
        WITH CHECK (fn_user_can_see_paciente(paciente_id))
    $POL$;
    EXECUTE $POL$
      CREATE POLICY p_fcp_update ON formato_control_paciente
        FOR UPDATE TO authenticated
        USING (fn_user_can_see_paciente(paciente_id))
        WITH CHECK (fn_user_can_see_paciente(paciente_id))
    $POL$;
  END IF;
END $$;

-- ------------------------------------------------------------
-- PRODUCTIVIDAD_CAPTURAS (filtrar por servicio_id directo)
-- ------------------------------------------------------------
ALTER TABLE productividad_capturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_prod_select ON productividad_capturas;
DROP POLICY IF EXISTS p_prod_insert ON productividad_capturas;
DROP POLICY IF EXISTS p_prod_update ON productividad_capturas;

CREATE POLICY p_prod_select ON productividad_capturas
  FOR SELECT TO authenticated
  USING (fn_user_can_write_servicio(servicio_id));

CREATE POLICY p_prod_insert ON productividad_capturas
  FOR INSERT TO authenticated
  WITH CHECK (fn_user_can_write_servicio(servicio_id));

CREATE POLICY p_prod_update ON productividad_capturas
  FOR UPDATE TO authenticated
  USING (fn_user_can_write_servicio(servicio_id))
  WITH CHECK (fn_user_can_write_servicio(servicio_id));

-- ------------------------------------------------------------
-- HISTORICOS_EGRESOS (solo lectura por scope)
-- ------------------------------------------------------------
ALTER TABLE historicos_egresos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_hist_select ON historicos_egresos;
DROP POLICY IF EXISTS p_hist_insert ON historicos_egresos;

-- jefe/subjefe/supervisor leen todo. gestor/enfermera no leen historicos.
CREATE POLICY p_hist_select ON historicos_egresos
  FOR SELECT TO authenticated
  USING (fn_es_admin_global());

CREATE POLICY p_hist_insert ON historicos_egresos
  FOR INSERT TO authenticated
  WITH CHECK (fn_es_admin_global() OR archivado_por = auth.uid());

-- ------------------------------------------------------------
-- PERFILES (cada quien lee solo el suyo; admin ve todos)
-- ------------------------------------------------------------
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_perfiles_select ON perfiles;

CREATE POLICY p_perfiles_select ON perfiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR fn_es_admin_global());

-- ------------------------------------------------------------
-- SANITY CHECKS
-- ------------------------------------------------------------
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pacientes','evento_apoyo_paciente','dietas','recetario',
                    'formato_control_paciente','productividad_capturas',
                    'historicos_egresos','perfiles')
ORDER BY tablename, policyname;
