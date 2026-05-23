-- ============================================================
-- ACCESO POR ASIGNACION DE ENFERMERIA POR TURNO
--
-- Usa la tabla EXISTENTE `asignaciones_enfermero_turno` (ya tiene
-- columnas: id, paciente_id, perfil_id, fecha, turno, asignado_por,
-- asignado_en, notas).
--
-- Cambios aqui:
--   - Helper fn_enfermera_tiene_acceso (con 30 min de gracia)
--   - Actualiza fn_user_can_see_paciente para incluir el caso enfermera
--   - RLS de asignaciones_enfermero_turno
--   - RLS de dietas/recetario: enfermera SOLO LEE
--   - RLS de pacientes: enfermera NO edita (ni ingreso ni egreso)
--
-- Modelo de acceso para rol='enfermera':
--   - Solo ve pacientes asignados por su gestor en su turno actual
--   - Ventana activa: turno + 30 min de gracia al final
--   - Pre-asignacion permitida (gestor puede asignar turnos futuros)
--   - Permite multiples enfermeras por paciente por turno (titular + apoyo)
--
-- Ventanas de acceso (hora local Mazatlan):
--   Turno M: 08:00 - 14:30 (14:00 + 30 min gracia)
--   Turno V: 14:01 - 20:30 (20:00 + 30 min gracia)
--   Turno N: 20:01 - 08:29 dia siguiente (07:59 + 30 min gracia)
--
-- Permisos enfermera/o:
--   - Censo: solo lectura
--   - Dietas, Recetario: solo lectura
--   - Control (formato_control_paciente, evento_apoyo_paciente): lectura + escritura
--
-- Idempotente.
-- ============================================================

-- 0) HELPERS BASE (idempotentes, normalmente vienen de 17_helpers_rls.sql
--    pero se incluyen aqui por si no se aplico ese archivo antes)
-- ============================================================

-- Es admin global (jefe / subjefe / supervisor)
CREATE OR REPLACE FUNCTION fn_es_admin_global()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfiles
    WHERE id = auth.uid()
      AND rol IN ('jefe', 'subjefe', 'supervisor')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Servicio_id del paciente (via cama -> subservicio -> servicio)
CREATE OR REPLACE FUNCTION fn_servicio_de_paciente(_paciente_id UUID)
RETURNS INTEGER AS $$
  SELECT sub.servicio_id
  FROM pacientes p
  JOIN camas c          ON c.id   = p.cama_id
  JOIN subservicios sub ON sub.id = c.subservicio_id
  WHERE p.id = _paciente_id
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Servicio_id de una cama (para INSERT de pacientes)
CREATE OR REPLACE FUNCTION fn_servicio_de_cama(_cama_id INTEGER)
RETURNS INTEGER AS $$
  SELECT sub.servicio_id
  FROM camas c
  JOIN subservicios sub ON sub.id = c.subservicio_id
  WHERE c.id = _cama_id
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Usuario puede escribir en servicio (jefe/subjefe/supervisor o gestor de ese servicio)
CREATE OR REPLACE FUNCTION fn_user_can_write_servicio(_servicio_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT
    fn_es_admin_global()
    OR EXISTS (
      SELECT 1 FROM perfiles p
      WHERE p.id = auth.uid()
        AND p.servicio_id = _servicio_id
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 1) Indices recomendados sobre la tabla existente
CREATE INDEX IF NOT EXISTS idx_asignaciones_enfermero_perfil_fecha_turno
  ON asignaciones_enfermero_turno (perfil_id, fecha, turno);

CREATE INDEX IF NOT EXISTS idx_asignaciones_enfermero_paciente_fecha_turno
  ON asignaciones_enfermero_turno (paciente_id, fecha, turno);

CREATE INDEX IF NOT EXISTS idx_asignaciones_enfermero_fecha_turno
  ON asignaciones_enfermero_turno (fecha, turno);

-- 2) Helper: enfermera tiene acceso al paciente AHORA (con ventana + gracia)
CREATE OR REPLACE FUNCTION fn_enfermera_tiene_acceso(
  _paciente_id UUID,
  _enfermera_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  _now_mzt TIMESTAMP;
  _hoy DATE;
  _ayer DATE;
  _hora TIME;
BEGIN
  _now_mzt := (NOW() AT TIME ZONE 'America/Mazatlan');
  _hoy := _now_mzt::DATE;
  _ayer := _hoy - INTERVAL '1 day';
  _hora := _now_mzt::TIME;

  RETURN EXISTS (
    SELECT 1 FROM asignaciones_enfermero_turno a
    WHERE a.paciente_id = _paciente_id
      AND a.perfil_id = _enfermera_id
      AND (
        -- Turno M hoy: 08:00 - 14:30
        (a.fecha = _hoy AND a.turno = 'M' AND _hora >= TIME '08:00' AND _hora <= TIME '14:30')
        -- Turno V hoy: 14:01 - 20:30
        OR (a.fecha = _hoy AND a.turno = 'V' AND _hora >= TIME '14:01' AND _hora <= TIME '20:30')
        -- Turno N hoy: 20:01 hasta medianoche
        OR (a.fecha = _hoy AND a.turno = 'N' AND _hora >= TIME '20:01')
        -- Turno N que inicio ayer y cruzo medianoche: 00:00 - 08:29
        OR (a.fecha = _ayer AND a.turno = 'N' AND _hora <= TIME '08:29')
      )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3) Actualizar fn_user_can_see_paciente para incluir el caso enfermera
CREATE OR REPLACE FUNCTION fn_user_can_see_paciente(_paciente_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  _rol TEXT;
  _user_servicio INTEGER;
  _paciente_servicio INTEGER;
BEGIN
  SELECT rol, servicio_id INTO _rol, _user_servicio
  FROM perfiles WHERE id = auth.uid();

  IF _rol IS NULL THEN RETURN FALSE; END IF;

  -- jefe / subjefe / supervisor: ven todo el hospital
  IF _rol IN ('jefe', 'subjefe', 'supervisor') THEN
    RETURN TRUE;
  END IF;

  -- gestor: ve pacientes de su servicio asignado
  IF _rol = 'gestor' AND _user_servicio IS NOT NULL THEN
    _paciente_servicio := fn_servicio_de_paciente(_paciente_id);
    RETURN _paciente_servicio = _user_servicio;
  END IF;

  -- enfermera: solo pacientes asignados en su turno activo
  IF _rol = 'enfermera' THEN
    RETURN fn_enfermera_tiene_acceso(_paciente_id, auth.uid());
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4) Helper: rol del usuario actual (para policies)
CREATE OR REPLACE FUNCTION fn_rol_usuario()
RETURNS TEXT AS $$
  SELECT rol FROM perfiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 5) RLS de asignaciones_enfermero_turno
-- ============================================================
ALTER TABLE asignaciones_enfermero_turno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_asig_select ON asignaciones_enfermero_turno;
DROP POLICY IF EXISTS p_asig_insert ON asignaciones_enfermero_turno;
DROP POLICY IF EXISTS p_asig_update ON asignaciones_enfermero_turno;
DROP POLICY IF EXISTS p_asig_delete ON asignaciones_enfermero_turno;

CREATE POLICY p_asig_select ON asignaciones_enfermero_turno
  FOR SELECT TO authenticated
  USING (
    perfil_id = auth.uid()
    OR fn_es_admin_global()
    OR (
      fn_rol_usuario() = 'gestor'
      AND fn_user_can_see_paciente(paciente_id)
    )
  );

CREATE POLICY p_asig_insert ON asignaciones_enfermero_turno
  FOR INSERT TO authenticated
  WITH CHECK (
    asignado_por = auth.uid()
    AND (
      fn_es_admin_global()
      OR (
        fn_rol_usuario() = 'gestor'
        AND fn_user_can_see_paciente(paciente_id)
      )
    )
  );

CREATE POLICY p_asig_update ON asignaciones_enfermero_turno
  FOR UPDATE TO authenticated
  USING (
    fn_es_admin_global()
    OR (
      fn_rol_usuario() = 'gestor'
      AND fn_user_can_see_paciente(paciente_id)
    )
  )
  WITH CHECK (
    fn_es_admin_global()
    OR (
      fn_rol_usuario() = 'gestor'
      AND fn_user_can_see_paciente(paciente_id)
    )
  );

CREATE POLICY p_asig_delete ON asignaciones_enfermero_turno
  FOR DELETE TO authenticated
  USING (
    fn_es_admin_global()
    OR (
      fn_rol_usuario() = 'gestor'
      AND fn_user_can_see_paciente(paciente_id)
    )
  );

-- ============================================================
-- 6) RLS Dietas: enfermera SOLO LEE
-- ============================================================
DROP POLICY IF EXISTS p_dietas_select ON dietas;
DROP POLICY IF EXISTS p_dietas_insert ON dietas;
DROP POLICY IF EXISTS p_dietas_update ON dietas;
DROP POLICY IF EXISTS p_dietas_delete ON dietas;

CREATE POLICY p_dietas_select ON dietas
  FOR SELECT TO authenticated
  USING (fn_user_can_see_paciente(paciente_id));

CREATE POLICY p_dietas_insert ON dietas
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_user_can_see_paciente(paciente_id)
    AND fn_rol_usuario() <> 'enfermera'
  );

CREATE POLICY p_dietas_update ON dietas
  FOR UPDATE TO authenticated
  USING (
    fn_user_can_see_paciente(paciente_id)
    AND fn_rol_usuario() <> 'enfermera'
  )
  WITH CHECK (
    fn_user_can_see_paciente(paciente_id)
    AND fn_rol_usuario() <> 'enfermera'
  );

-- ============================================================
-- 7) RLS Recetario: enfermera SOLO LEE
-- ============================================================
DROP POLICY IF EXISTS p_recetario_select ON recetario;
DROP POLICY IF EXISTS p_recetario_insert ON recetario;
DROP POLICY IF EXISTS p_recetario_update ON recetario;
DROP POLICY IF EXISTS p_recetario_delete ON recetario;

CREATE POLICY p_recetario_select ON recetario
  FOR SELECT TO authenticated
  USING (fn_user_can_see_paciente(paciente_id));

CREATE POLICY p_recetario_insert ON recetario
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_user_can_see_paciente(paciente_id)
    AND fn_rol_usuario() <> 'enfermera'
  );

CREATE POLICY p_recetario_update ON recetario
  FOR UPDATE TO authenticated
  USING (
    fn_user_can_see_paciente(paciente_id)
    AND fn_rol_usuario() <> 'enfermera'
  )
  WITH CHECK (
    fn_user_can_see_paciente(paciente_id)
    AND fn_rol_usuario() <> 'enfermera'
  );

-- ============================================================
-- 8) Censo (tabla pacientes): enfermera no edita
-- ============================================================
DROP POLICY IF EXISTS p_pacientes_insert ON pacientes;
DROP POLICY IF EXISTS p_pacientes_update ON pacientes;

CREATE POLICY p_pacientes_insert ON pacientes
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_user_can_write_servicio(fn_servicio_de_cama(cama_id))
    AND capturado_por = auth.uid()
    AND fn_rol_usuario() <> 'enfermera'
  );

CREATE POLICY p_pacientes_update ON pacientes
  FOR UPDATE TO authenticated
  USING (fn_user_can_see_paciente(id))
  WITH CHECK (
    fn_user_can_see_paciente(id)
    AND fn_rol_usuario() <> 'enfermera'
  );

-- ============================================================
-- 9) Eventos y formato_control: enfermera SI puede escribir
--    fn_user_can_see_paciente ya restringe el scope (turno + asignacion)
--    Las policies actuales lo permiten.
-- ============================================================

-- ============================================================
-- 10) Sanity check
-- ============================================================
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('asignaciones_enfermero_turno', 'dietas', 'recetario', 'pacientes')
ORDER BY tablename, policyname;
