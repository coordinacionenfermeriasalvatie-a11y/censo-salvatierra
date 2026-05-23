-- ============================================================
-- HELPERS RLS — Funciones que determinan scope por rol
--
-- Reglas:
--   * jefe / subjefe / supervisor : ven y editan TODO el hospital
--   * gestor / enfermera          : ven y editan SOLO su servicio
--
-- Funciones:
--   fn_perfil_actual()       -> (rol, servicio_id) del usuario logueado
--   fn_es_admin_global()     -> bool: jefe/subjefe/supervisor
--   fn_servicio_de_paciente()-> servicio_id del paciente
--   fn_user_can_see_paciente(uuid) -> bool: usuario puede ver al paciente
--   fn_user_can_write_servicio(int)-> bool: usuario puede escribir en el servicio
--
-- Todas SECURITY DEFINER para que las RLS policies no entren en
-- recursion al leer perfiles. STABLE = mismo resultado dentro de una query.
-- ============================================================

-- 1) Perfil del usuario logueado (cache para evitar multiples lookups)
CREATE OR REPLACE FUNCTION fn_perfil_actual()
RETURNS TABLE(rol TEXT, servicio_id INTEGER) AS $$
  SELECT p.rol, p.servicio_id
  FROM perfiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2) Es admin global (jefe / subjefe / supervisor)
CREATE OR REPLACE FUNCTION fn_es_admin_global()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfiles
    WHERE id = auth.uid()
      AND rol IN ('jefe', 'subjefe', 'supervisor')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3) Servicio_id del paciente (via cama -> subservicio -> servicio)
CREATE OR REPLACE FUNCTION fn_servicio_de_paciente(_paciente_id UUID)
RETURNS INTEGER AS $$
  SELECT sub.servicio_id
  FROM pacientes p
  JOIN camas c          ON c.id   = p.cama_id
  JOIN subservicios sub ON sub.id = c.subservicio_id
  WHERE p.id = _paciente_id
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4) Usuario puede ver paciente
CREATE OR REPLACE FUNCTION fn_user_can_see_paciente(_paciente_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    fn_es_admin_global()
    OR EXISTS (
      SELECT 1 FROM perfiles p
      WHERE p.id = auth.uid()
        AND p.servicio_id IS NOT NULL
        AND p.servicio_id = fn_servicio_de_paciente(_paciente_id)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5) Usuario puede escribir en servicio (por ID)
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

-- 6) Para INSERT de pacientes: dado el cama_id, retorna el servicio_id
CREATE OR REPLACE FUNCTION fn_servicio_de_cama(_cama_id INTEGER)
RETURNS INTEGER AS $$
  SELECT sub.servicio_id
  FROM camas c
  JOIN subservicios sub ON sub.id = c.subservicio_id
  WHERE c.id = _cama_id
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION fn_user_can_see_paciente IS
  'RLS helper. True si el usuario logueado es jefe/subjefe/supervisor (ven todo) o si el paciente pertenece a su servicio asignado.';
