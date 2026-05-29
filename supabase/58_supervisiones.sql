-- ============================================================
-- Migracion 58: Dos supervisiones (Supervision 1 / Supervision 2)
-- ============================================================
-- Cada supervision centraliza un conjunto de servicios. Modelo:
-- columna `supervision` (1 o 2) en `servicios` y en `perfiles`.
-- Se mantiene el rol 'supervisor'.
--
--   - Un supervisor con `supervision` asignada solo ve/centraliza los
--     servicios de su grupo.
--   - jefe / subjefe (y un supervisor con supervision NULL) siguen
--     viendo TODO, como hasta ahora.
--
-- Reparto de servicios:
--   Sup 1: URG, UPED, CDH, TOC, PSQ, UCI, CIN
--   Sup 2: PED, HH1, HH2, HM, ONC, URPA, HDL, HDN
--
-- ASCII puro y lineas cortas a proposito (evita truncado al pegar).
-- Idempotente: se puede correr varias veces sin efectos secundarios.
-- ============================================================

-- 1) Columnas
ALTER TABLE servicios
  ADD COLUMN IF NOT EXISTS supervision SMALLINT
  CHECK (supervision IS NULL OR supervision IN (1, 2));

ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS supervision SMALLINT
  CHECK (supervision IS NULL OR supervision IN (1, 2));

-- 2) Reparto de servicios por codigo
UPDATE servicios SET supervision = 1
 WHERE codigo IN ('URG','UPED','CDH','TOC','PSQ','UCI','CIN');

UPDATE servicios SET supervision = 2
 WHERE codigo IN ('PED','HH1','HH2','HM','ONC','URPA','HDL','HDN');

-- 3) Helper: supervision del usuario autenticado (RLS futura y vistas)
CREATE OR REPLACE FUNCTION fn_supervision_de_usuario()
RETURNS SMALLINT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT supervision FROM perfiles WHERE id = auth.uid();
$$;

-- 4) Recrear v_ocupacion_servicios agregando `supervision`.
--    Misma logica que antes (censables/bloqueadas/extras); solo
--    se agrega la columna supervision al final.
DROP VIEW IF EXISTS v_ocupacion_servicios;

CREATE VIEW v_ocupacion_servicios AS
SELECT
  s.id AS servicio_id,
  s.codigo,
  s.nombre AS servicio,
  COUNT(DISTINCT c.id) FILTER (
    WHERE c.es_censable = TRUE
      AND c.activa = TRUE
      AND COALESCE(c.bloqueada, FALSE) = FALSE
  ) AS total_camas,
  COUNT(DISTINCT p.id) FILTER (
    WHERE p.estado = 'ACTIVO'
      AND c.es_censable = TRUE
      AND COALESCE(c.bloqueada, FALSE) = FALSE
  ) AS camas_ocupadas,
  COUNT(DISTINCT c.id) FILTER (
    WHERE c.es_censable = TRUE
      AND c.activa = TRUE
      AND COALESCE(c.bloqueada, FALSE) = FALSE
  )
  - COUNT(DISTINCT p.id) FILTER (
    WHERE p.estado = 'ACTIVO'
      AND c.es_censable = TRUE
      AND COALESCE(c.bloqueada, FALSE) = FALSE
  ) AS camas_disponibles,
  ROUND(
    COUNT(DISTINCT p.id) FILTER (
      WHERE p.estado = 'ACTIVO'
        AND c.es_censable = TRUE
        AND COALESCE(c.bloqueada, FALSE) = FALSE
    )::numeric
    / NULLIF(
        COUNT(DISTINCT c.id) FILTER (
          WHERE c.es_censable = TRUE
            AND c.activa = TRUE
            AND COALESCE(c.bloqueada, FALSE) = FALSE
        ), 0
      )::numeric
    * 100, 2
  ) AS porcentaje_ocupacion,
  COUNT(DISTINCT p.id) FILTER (
    WHERE p.estado = 'ACTIVO' AND c.es_censable = FALSE
  ) AS extras_ocupados,
  COUNT(DISTINCT c.id) FILTER (
    WHERE c.es_censable = FALSE AND c.activa = TRUE
  ) AS extras_totales,
  COUNT(DISTINCT c.id) FILTER (
    WHERE c.es_censable = TRUE
      AND c.activa = TRUE
      AND c.bloqueada = TRUE
  ) AS camas_bloqueadas,
  s.orden,
  s.supervision
FROM servicios s
LEFT JOIN subservicios sub ON sub.servicio_id = s.id
LEFT JOIN camas c ON c.subservicio_id = sub.id
LEFT JOIN pacientes p ON p.cama_id = c.id AND p.estado = 'ACTIVO'
GROUP BY s.id, s.codigo, s.nombre, s.orden, s.supervision
ORDER BY s.orden;

GRANT SELECT ON v_ocupacion_servicios TO authenticated;

-- 5) PLANTILLA -- asignar cada supervisor a su grupo.
--    Descomenta y reemplaza la matricula de cada supervisor:
-- UPDATE perfiles SET supervision = 1 WHERE matricula = 'MATRICULA_SUP1';
-- UPDATE perfiles SET supervision = 2 WHERE matricula = 'MATRICULA_SUP2';

-- 6) POST-CHECK: reparto de servicios por supervision
SELECT COALESCE(supervision::text, 'SIN ASIGNAR') AS supervision,
       string_agg(codigo, ', ' ORDER BY orden) AS servicios
FROM servicios
GROUP BY supervision
ORDER BY supervision NULLS LAST;
