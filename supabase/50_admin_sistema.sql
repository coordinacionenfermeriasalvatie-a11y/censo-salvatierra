-- ============================================================
-- Migración 50: Admin de sistema (override de privilegios visuales)
-- ============================================================
-- es_admin_sistema = TRUE da acceso a:
--   - Panel "En línea ahora" del Dashboard
--   - Auditoría histórica completa (todos los días)
-- Independiente del rol técnico. Para Stavros (subjefe administrador).
-- Jefe también tiene estos accesos (sin necesidad de la flag).
-- ============================================================

ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS es_admin_sistema BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN perfiles.es_admin_sistema IS
  'Override de privilegios visuales (En línea, Auditoría histórica). Para subjefes que actúan como admin del sistema. Jefe los tiene automáticamente.';

UPDATE perfiles SET es_admin_sistema = TRUE
WHERE id = (SELECT id FROM auth.users WHERE email = 'sorvatsalaya@gmail.com');

-- Helper para usar en RLS / vistas
CREATE OR REPLACE FUNCTION public.fn_es_jefe_o_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfiles
    WHERE id = auth.uid()
      AND activo
      AND (rol = 'jefe' OR es_admin_sistema = TRUE)
  );
$$;

COMMENT ON FUNCTION public.fn_es_jefe_o_admin IS
  'TRUE si el usuario actual es jefe o tiene la flag es_admin_sistema. Útil para Auditoría histórica y En línea ahora.';

-- Actualizar policy de auditoria para usar el nuevo criterio
DROP POLICY IF EXISTS p_auditoria_select_solo_jefe ON auditoria;
CREATE POLICY p_auditoria_select_jefe_o_admin
  ON auditoria FOR SELECT
  TO authenticated
  USING (
    fn_es_jefe_o_admin()
    OR (
      -- Subjefe/supervisor: solo HOY y solo SU turno actual
      EXISTS (SELECT 1 FROM perfiles
              WHERE id = auth.uid()
                AND rol IN ('subjefe','supervisor')
                AND activo)
      AND (registrado_en AT TIME ZONE 'America/Mazatlan')::date = (NOW() AT TIME ZONE 'America/Mazatlan')::date
      AND fn_turno_de_fecha(registrado_en) = fn_turno_actual()
    )
  );

-- POST-CHECK
SELECT au.email, p.rol, p.es_admin_sistema, p.titulo_display
FROM perfiles p
JOIN auth.users au ON au.id = p.id
WHERE p.es_admin_sistema = TRUE OR p.rol = 'jefe'
ORDER BY p.rol DESC;
