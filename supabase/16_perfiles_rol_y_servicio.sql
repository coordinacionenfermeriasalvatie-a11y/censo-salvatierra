-- ============================================================
-- AMPLIACION DE perfiles: nuevo rol 'jefe' + FK servicio_id
--
-- 1) Agrega 'jefe' al CHECK de rol (jefe = mismo nivel que subjefe).
-- 2) Asegura FK servicio_id -> servicios(id) (la columna ya existe
--    pero sin FK en el schema base). Para gestor/enfermera, este
--    campo es OBLIGATORIO en la app; en DB lo dejamos NULL-able
--    porque jefe/subjefe/supervisor no tienen servicio asignado.
-- 3) Indice por servicio_id (para policies RLS rapidas).
--
-- Idempotente.
-- ============================================================

-- 1) Ampliar CHECK rol
ALTER TABLE perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;

ALTER TABLE perfiles ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN ('jefe', 'subjefe', 'supervisor', 'gestor', 'enfermera'));

-- 2) FK servicio_id (si todavia no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'perfiles'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'perfiles_servicio_id_fkey'
  ) THEN
    ALTER TABLE perfiles
      ADD CONSTRAINT perfiles_servicio_id_fkey
      FOREIGN KEY (servicio_id) REFERENCES servicios(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Indice
CREATE INDEX IF NOT EXISTS idx_perfiles_servicio ON perfiles(servicio_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON perfiles(rol);

-- 4) Sanity check
SELECT id, matricula, nombre_completo, rol, servicio_id, turno_principal, activo
FROM perfiles
ORDER BY rol, matricula;
