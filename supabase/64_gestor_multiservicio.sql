-- ============================================================
-- Migración 64: Gestor multi-servicio (servicios_extra)
-- ============================================================
-- Permite que UN solo gestor (una sola cuenta / un solo perfil) administre
-- VARIOS servicios a la vez. Hasta ahora un perfil solo tenía `servicio_id`
-- (un servicio). Ahora se agrega `servicios_extra INTEGER[]` con los servicios
-- ADICIONALES que ese gestor también gestiona.
--
-- Caso que motiva el cambio: Carlos Reyes = gestor de Hospitalización
-- Hombres 1 (id 7) Y Hombres 2 (id 8) con la MISMA cuenta.
--   -> servicio_id = 7, servicios_extra = '{8}'
--
-- El acceso del gestor se decide en dos helpers SECURITY DEFINER (su última
-- definición viva está en 19_asignacion_enfermera.sql):
--   - fn_user_can_write_servicio  (escritura: pacientes, camas, dietas, ...)
--   - fn_user_can_see_paciente    (lectura  : censo, asignaciones, ...)
-- Aquí se re-crean para que también consideren `servicios_extra`.
--
-- jefe/subjefe/supervisor (admin global) y enfermera NO usan servicios_extra:
-- su lógica no cambia.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.
-- ============================================================

-- 1) Nueva columna: servicios ADICIONALES del gestor (vacío por defecto)
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS servicios_extra INTEGER[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN perfiles.servicios_extra IS
  'Servicios ADICIONALES que un gestor administra, además de servicio_id. Solo aplica a rol=gestor. Vacío para los demás roles.';

-- 2) Escritura: admin global, o gestor cuyo servicio_id O servicios_extra
--    incluya el servicio objetivo.
CREATE OR REPLACE FUNCTION fn_user_can_write_servicio(_servicio_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT
    fn_es_admin_global()
    OR EXISTS (
      SELECT 1 FROM perfiles p
      WHERE p.id = auth.uid()
        AND (
          p.servicio_id = _servicio_id
          OR _servicio_id = ANY(p.servicios_extra)
        )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3) Lectura de paciente: el gestor ve pacientes de su servicio_id O de
--    cualquiera de sus servicios_extra.
CREATE OR REPLACE FUNCTION fn_user_can_see_paciente(_paciente_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  _rol TEXT;
  _user_servicio INTEGER;
  _user_servicios_extra INTEGER[];
  _paciente_servicio INTEGER;
BEGIN
  SELECT rol, servicio_id, servicios_extra
    INTO _rol, _user_servicio, _user_servicios_extra
  FROM perfiles WHERE id = auth.uid();

  IF _rol IS NULL THEN RETURN FALSE; END IF;

  -- jefe / subjefe / supervisor: ven todo el hospital
  IF _rol IN ('jefe', 'subjefe', 'supervisor') THEN
    RETURN TRUE;
  END IF;

  -- gestor: ve pacientes de su servicio asignado o de sus servicios_extra
  IF _rol = 'gestor' THEN
    _paciente_servicio := fn_servicio_de_paciente(_paciente_id);
    RETURN (_user_servicio IS NOT NULL AND _paciente_servicio = _user_servicio)
        OR (_paciente_servicio = ANY(_user_servicios_extra));
  END IF;

  -- enfermera: solo pacientes asignados en su turno activo
  IF _rol = 'enfermera' THEN
    RETURN fn_enfermera_tiene_acceso(_paciente_id, auth.uid());
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 4) Sanity check
-- ============================================================
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'perfiles' AND column_name = 'servicios_extra';
