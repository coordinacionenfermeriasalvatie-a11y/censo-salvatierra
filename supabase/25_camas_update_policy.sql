-- ============================================================
-- Migración 25: RLS UPDATE para camas (bloqueo / no ocupable)
-- ============================================================
-- Hasta ahora camas solo tenía SELECT policy (auth_select_camas). Para
-- permitir que jefe/subjefe/supervisor (admins globales) y gestor del
-- servicio puedan marcar una cama como NO OCUPABLE o liberarla, hay que
-- abrir UPDATE con la regla habitual: admin global o gestor del servicio.
--
-- Enfermeras (RLS por turno) NO pueden bloquear camas — el flujo de la
-- enfermería de piso es solo lectura del censo.
-- ============================================================

DROP POLICY IF EXISTS p_camas_update ON camas;

CREATE POLICY p_camas_update ON camas
  FOR UPDATE
  USING (
    fn_user_can_write_servicio(
      (SELECT s.id FROM subservicios sub
        JOIN servicios s ON s.id = sub.servicio_id
        WHERE sub.id = camas.subservicio_id)
    )
  )
  WITH CHECK (
    fn_user_can_write_servicio(
      (SELECT s.id FROM subservicios sub
        JOIN servicios s ON s.id = sub.servicio_id
        WHERE sub.id = camas.subservicio_id)
    )
  );

-- POST-CHECK
SELECT polname, polcmd FROM pg_policy WHERE polrelid='camas'::regclass ORDER BY polname;
