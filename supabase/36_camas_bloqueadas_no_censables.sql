-- ============================================================
-- Migración 36: Camas bloqueadas dejan de contar como censables
-- ============================================================
-- Cambios:
--  1) Eliminar cama "24A" de HH2 (alta erróneamente).
--  2) Recrear v_ocupacion_servicios para que el total censable y el
--     % de ocupación EXCLUYAN automáticamente camas bloqueadas
--     (cualquier causa: SIN CAMA, DESCOMPUESTA, etc.) hasta que se
--     desbloqueen.
-- ============================================================

-- 1) Eliminar la cama 24A de HH2 (no tiene historial)
DELETE FROM camas WHERE id = 155 AND numero_cama = '24A';

-- 2) Recrear la vista con cálculo dinámico:
--    - camas_censables_activas = censables activas Y no bloqueadas
--    - camas_ocupadas = pacientes activos en camas censables
--    - porcentaje = ocupadas / censables_activas
DROP VIEW IF EXISTS v_ocupacion_servicios;

CREATE VIEW v_ocupacion_servicios AS
SELECT
  s.id   AS servicio_id,
  s.codigo,
  s.nombre AS servicio,
  -- Total censables EFECTIVAS: activas, no bloqueadas, censables.
  -- Se usa también como "total_camas" para mantener compatibilidad
  -- con clientes existentes que esperan ese alias.
  COUNT(DISTINCT c.id) FILTER (WHERE c.es_censable = TRUE AND c.activa = TRUE AND COALESCE(c.bloqueada, FALSE) = FALSE) AS total_camas,
  COUNT(DISTINCT p.id) FILTER (WHERE p.estado = 'ACTIVO' AND c.es_censable = TRUE AND COALESCE(c.bloqueada, FALSE) = FALSE) AS camas_ocupadas,
  COUNT(DISTINCT c.id) FILTER (WHERE c.es_censable = TRUE AND c.activa = TRUE AND COALESCE(c.bloqueada, FALSE) = FALSE)
    - COUNT(DISTINCT p.id) FILTER (WHERE p.estado = 'ACTIVO' AND c.es_censable = TRUE AND COALESCE(c.bloqueada, FALSE) = FALSE) AS camas_disponibles,
  ROUND(
    COUNT(DISTINCT p.id) FILTER (WHERE p.estado = 'ACTIVO' AND c.es_censable = TRUE AND COALESCE(c.bloqueada, FALSE) = FALSE)::numeric
    / NULLIF(COUNT(DISTINCT c.id) FILTER (WHERE c.es_censable = TRUE AND c.activa = TRUE AND COALESCE(c.bloqueada, FALSE) = FALSE), 0)::numeric
    * 100, 2
  ) AS porcentaje_ocupacion,
  -- Extras (camillas/sillas): solo NO censables
  COUNT(DISTINCT p.id) FILTER (WHERE p.estado = 'ACTIVO' AND c.es_censable = FALSE) AS extras_ocupados,
  COUNT(DISTINCT c.id) FILTER (WHERE c.es_censable = FALSE AND c.activa = TRUE) AS extras_totales,
  -- Camas bloqueadas (informativo): censables activas pero marcadas no ocupables
  COUNT(DISTINCT c.id) FILTER (WHERE c.es_censable = TRUE AND c.activa = TRUE AND c.bloqueada = TRUE) AS camas_bloqueadas,
  s.orden
FROM servicios s
LEFT JOIN subservicios sub ON sub.servicio_id = s.id
LEFT JOIN camas c ON c.subservicio_id = sub.id
LEFT JOIN pacientes p ON p.cama_id = c.id AND p.estado = 'ACTIVO'
GROUP BY s.id, s.codigo, s.nombre, s.orden
ORDER BY s.orden;

COMMENT ON VIEW v_ocupacion_servicios IS
  'Ocupación por servicio. total_camas se calcula dinámicamente como (censables activas - bloqueadas), de modo que una cama bloqueada NO cuenta en el % de ocupación hasta que se desbloquea.';

GRANT SELECT ON v_ocupacion_servicios TO authenticated;

-- POST-CHECK
SELECT codigo, total_camas, camas_ocupadas, camas_disponibles, porcentaje_ocupacion, camas_bloqueadas
FROM v_ocupacion_servicios
ORDER BY orden;
