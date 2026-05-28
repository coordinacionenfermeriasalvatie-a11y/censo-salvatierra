-- ============================================================
-- Migración 49: titulo_display para personalizar cómo se ve el rol
-- ============================================================
-- Permite que un usuario tenga rol técnico distinto a su título
-- visible. Ej. Stavros tiene rol='jefe' (privilegios completos)
-- pero se muestra como 'Subjefe · Administrador del sistema'.
-- ============================================================

ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS titulo_display TEXT;

COMMENT ON COLUMN perfiles.titulo_display IS
  'Título visible en UI cuando difiere del rol técnico. NULL = usar rol.toUpperCase().';

-- Set para Stavros
UPDATE perfiles SET titulo_display = 'SUBJEFE · ADMINISTRADOR DEL SISTEMA'
WHERE id = (SELECT id FROM auth.users WHERE email = 'sorvatsalaya@gmail.com');

-- POST-CHECK
SELECT au.email, p.nombre_completo, p.rol, p.titulo_display
FROM perfiles p
JOIN auth.users au ON au.id = p.id
WHERE p.titulo_display IS NOT NULL;
