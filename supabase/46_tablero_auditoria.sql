-- ============================================================
-- Migración 46: Tablero de Auditoría — solo jefes
-- ============================================================
-- Objetivos:
--   1. Restringir la lectura de `auditoria` a rol='jefe' (estaba USING true).
--   2. Helper fn_es_jefe() reutilizable.
--   3. Vistas legibles para 4 sub-pestañas del tablero:
--      - v_auditoria_legible (timeline cronológico con nombres y sección)
--      - v_auditoria_ranking_usuario (top usuarios por cambios)
--      - v_auditoria_ranking_seccion (top secciones modificadas)
--      - v_auditoria_paciente (todas las modificaciones que tocan a un paciente)
-- ============================================================

-- 1) Helper fn_es_jefe (paralelo a fn_es_admin_global)
CREATE OR REPLACE FUNCTION public.fn_es_jefe()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'jefe' AND activo
  );
$$;

COMMENT ON FUNCTION public.fn_es_jefe IS
  'TRUE si el usuario autenticado actual tiene rol jefe y está activo.';

-- 2) Reemplazar policy demasiado permisiva
DROP POLICY IF EXISTS lectura_auditoria_solo_lectura ON auditoria;

CREATE POLICY p_auditoria_select_solo_jefe
  ON auditoria FOR SELECT
  TO authenticated
  USING (fn_es_jefe());

-- 3) Vista timeline cronológica con nombres legibles + clasificación a sección
CREATE OR REPLACE VIEW v_auditoria_legible AS
SELECT
  a.id,
  a.registrado_en,
  a.tabla,
  a.operacion,
  a.campo,
  a.valor_anterior,
  a.valor_nuevo,
  a.motivo,
  a.registro_id,
  a.usuario_id,
  COALESCE(p.nombre_completo, '(usuario eliminado)') AS usuario_nombre,
  p.rol AS usuario_rol,
  s.codigo AS usuario_servicio_codigo,
  s.nombre AS usuario_servicio_nombre,
  CASE a.tabla
    WHEN 'pacientes'                  THEN 'Censo'
    WHEN 'formato_control_paciente'   THEN 'Control'
    WHEN 'evento_apoyo_paciente'      THEN 'Control'
    WHEN 'dietas_paciente'            THEN 'Dietas'
    WHEN 'recetario_medicamentos'     THEN 'Recetario'
    WHEN 'productividad_capturas'     THEN 'Productividad'
    WHEN 'asignaciones_enfermero_turno' THEN 'Asignaciones'
    WHEN 'bitacora_heridas'           THEN 'Clínica de Heridas'
    ELSE a.tabla
  END AS seccion,
  a.ip_origen
FROM auditoria a
LEFT JOIN perfiles p ON p.id = a.usuario_id
LEFT JOIN servicios s ON s.id = p.servicio_id;

COMMENT ON VIEW v_auditoria_legible IS
  'Timeline de auditoría con nombre de usuario, rol, servicio y sección clasificada. RLS heredado de auditoria (solo jefe).';

-- 4) Ranking por usuario (agregado por usuario y sección, últimos 30 días)
CREATE OR REPLACE VIEW v_auditoria_ranking_usuario AS
SELECT
  v.usuario_id,
  v.usuario_nombre,
  v.usuario_rol,
  v.usuario_servicio_codigo,
  COUNT(*) FILTER (WHERE v.operacion = 'INSERT') AS inserts,
  COUNT(*) FILTER (WHERE v.operacion = 'UPDATE') AS updates,
  COUNT(*) FILTER (WHERE v.operacion = 'DELETE') AS deletes,
  COUNT(*) AS total_cambios,
  MAX(v.registrado_en) AS ultimo_cambio
FROM v_auditoria_legible v
WHERE v.registrado_en > NOW() - interval '30 days'
GROUP BY v.usuario_id, v.usuario_nombre, v.usuario_rol, v.usuario_servicio_codigo;

COMMENT ON VIEW v_auditoria_ranking_usuario IS
  'Ranking de actividad por usuario en últimos 30 días.';

-- 5) Ranking por sección (qué módulos se editan más)
CREATE OR REPLACE VIEW v_auditoria_ranking_seccion AS
SELECT
  v.seccion,
  COUNT(*) FILTER (WHERE v.operacion = 'INSERT') AS inserts,
  COUNT(*) FILTER (WHERE v.operacion = 'UPDATE') AS updates,
  COUNT(*) FILTER (WHERE v.operacion = 'DELETE') AS deletes,
  COUNT(*) AS total_cambios,
  COUNT(DISTINCT v.usuario_id) AS usuarios_distintos
FROM v_auditoria_legible v
WHERE v.registrado_en > NOW() - interval '30 days'
GROUP BY v.seccion;

COMMENT ON VIEW v_auditoria_ranking_seccion IS
  'Ranking de actividad por sección/módulo en últimos 30 días.';

-- 6) Vista de cambios por paciente — junta operaciones en pacientes,
--    formato_control_paciente, evento_apoyo_paciente, dietas_paciente,
--    recetario_medicamentos donde registro_id apunta al paciente o a un
--    objeto que pertenece a un paciente.
CREATE OR REPLACE VIEW v_auditoria_paciente AS
SELECT
  v.id,
  v.registrado_en,
  v.tabla,
  v.seccion,
  v.operacion,
  v.campo,
  v.valor_anterior,
  v.valor_nuevo,
  v.motivo,
  v.usuario_id,
  v.usuario_nombre,
  v.usuario_rol,
  -- Resolver paciente_id según la tabla auditada:
  CASE v.tabla
    WHEN 'pacientes' THEN v.registro_id::uuid
    WHEN 'formato_control_paciente' THEN
      (SELECT paciente_id FROM formato_control_paciente WHERE paciente_id::text = v.registro_id LIMIT 1)
    WHEN 'evento_apoyo_paciente' THEN
      (SELECT paciente_id FROM evento_apoyo_paciente WHERE id::text = v.registro_id LIMIT 1)
    WHEN 'dietas_paciente' THEN
      (SELECT paciente_id FROM dietas_paciente WHERE paciente_id::text = v.registro_id LIMIT 1)
    WHEN 'recetario_medicamentos' THEN
      (SELECT paciente_id FROM recetario_medicamentos WHERE id::text = v.registro_id LIMIT 1)
    ELSE NULL
  END AS paciente_id
FROM v_auditoria_legible v
WHERE v.tabla IN ('pacientes','formato_control_paciente','evento_apoyo_paciente','dietas_paciente','recetario_medicamentos');

COMMENT ON VIEW v_auditoria_paciente IS
  'Cambios que afectan a un paciente específico, resolviendo paciente_id según la tabla auditada.';

-- 7) POST-CHECK
SELECT 'policies de auditoria' AS check, COUNT(*) FROM pg_policies WHERE schemaname='public' AND tablename='auditoria'
UNION ALL
SELECT 'fn_es_jefe existe', COUNT(*)::bigint FROM pg_proc WHERE proname='fn_es_jefe'
UNION ALL
SELECT 'vistas creadas', COUNT(*)::bigint FROM information_schema.views WHERE table_schema='public' AND table_name LIKE 'v_auditoria%';
