-- ============================================================
-- Migracion 80: Ajuste MANUAL del fondo fijo de psicotropicos
-- ------------------------------------------------------------
-- Dictado del subjefe: SOLO el jefe y el administrador del sistema
-- (es_admin_sistema) deben poder EDITAR, en Supervision 1 y 2, los
-- numeros de la hoja de fondo fijo de psicotropicos:
--   fondo fijo, recibido (por turno), surtido (por turno),
--   utilizado (por turno), vales (por turno) y el stock actual.
--
-- PROBLEMA: casi todos esos numeros NO se guardan. La vista
-- v_stock_psicotropicos_hoy los CALCULA sumando movimientos del dia.
-- 'utilizado' y 'vale' los genera AUTOMATICAMENTE el trigger de canje
-- (fn_registrar_canje_psicotropico) y traen receta_id (trazabilidad
-- vale -> receta). Editar/borrar esos movimientos romperia esa cadena.
--
-- SOLUCION (capa de ajuste manual, elegida por el subjefe):
--   * NO se tocan los movimientos ni los vales ligados a recetas.
--   * Una tabla aparte guarda el "valor override" por
--     (fecha x supervision x medicamento). La vista muestra el valor
--     manual cuando existe; si no, el calculado. Totalmente reversible.
--   * fondo_fijo es baseline (no es por-dia): se edita directo en
--     fondo_fijo_psicotropicos (afecta todos los dias, que es lo correcto
--     para un fondo fijo). El override por-dia es para el resto.
--
-- Semantica del override (modo manual de un renglon):
--   Al guardar un ajuste, ese renglon queda FIJO para ese dia: los
--   per-turno (recibido/surtido/utilizado/vales) toman los valores
--   guardados y dejan de recalcularse. 'stock_actual' = override directo
--   si se dio, si no se calcula de las partes (efectivas). Para volver al
--   calculo automatico se borra el ajuste (fn_limpiar_ajuste_psico).
--
-- Permisos: SOLO jefe o es_admin_sistema. Se reutiliza el helper ya
-- existente public.fn_es_jefe_o_admin() (mig 50). Las escrituras pasan
-- por RPC SECURITY DEFINER; la tabla no tiene policy de escritura directa.
--
-- ASCII puro y lineas cortas (evita truncado al pegar en el SQL Editor).
-- Idempotente. Correr en el SQL Editor de Supabase (proyecto xdvvmtqjksebqoflvbhj).
-- ============================================================
BEGIN;

-- 1) Tabla de ajuste manual por (fecha x supervision x medicamento).
--    Cada columna NULL = "usar el valor calculado". No NULL = override.
CREATE TABLE IF NOT EXISTS ajuste_manual_psicotropicos (
  fecha           DATE     NOT NULL,
  supervision     SMALLINT NOT NULL CHECK (supervision IN (1, 2)),
  inventario_id   INTEGER  NOT NULL REFERENCES inventario_psicotropicos(id),
  recibido_m      INTEGER CHECK (recibido_m  IS NULL OR recibido_m  >= 0),
  recibido_v      INTEGER CHECK (recibido_v  IS NULL OR recibido_v  >= 0),
  recibido_n      INTEGER CHECK (recibido_n  IS NULL OR recibido_n  >= 0),
  surtido_m       INTEGER CHECK (surtido_m   IS NULL OR surtido_m   >= 0),
  surtido_v       INTEGER CHECK (surtido_v   IS NULL OR surtido_v   >= 0),
  surtido_n       INTEGER CHECK (surtido_n   IS NULL OR surtido_n   >= 0),
  utilizado_m     INTEGER CHECK (utilizado_m IS NULL OR utilizado_m >= 0),
  utilizado_v     INTEGER CHECK (utilizado_v IS NULL OR utilizado_v >= 0),
  utilizado_n     INTEGER CHECK (utilizado_n IS NULL OR utilizado_n >= 0),
  vales_m         INTEGER CHECK (vales_m     IS NULL OR vales_m     >= 0),
  vales_v         INTEGER CHECK (vales_v     IS NULL OR vales_v     >= 0),
  vales_n         INTEGER CHECK (vales_n     IS NULL OR vales_n     >= 0),
  stock_actual    INTEGER,  -- override directo del stock (NULL = calcular)
  ajustado_por    UUID REFERENCES perfiles(id),
  ajustado_nombre TEXT,
  ajustado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fecha, supervision, inventario_id)
);

COMMENT ON TABLE ajuste_manual_psicotropicos IS
  'Override manual (jefe/admin) de la hoja de fondo fijo de psicotropicos por dia y supervision. NULL en una columna = usar el valor calculado de los movimientos. No toca los movimientos ni los vales ligados a recetas.';

-- 2) RLS: lectura para autenticados (la vista la usa igual). Escritura
--    SOLO por RPC SECURITY DEFINER (no hay policy de INSERT/UPDATE/DELETE).
ALTER TABLE ajuste_manual_psicotropicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ajuste_psico_select ON ajuste_manual_psicotropicos;
CREATE POLICY p_ajuste_psico_select ON ajuste_manual_psicotropicos
  FOR SELECT TO authenticated USING (true);

-- 3) Vista de stock reescrita: per-turno de recibido/surtido + override.
--    1 fila por (supervision x medicamento). stock_actual respeta override.
DROP VIEW IF EXISTS v_stock_psicotropicos_hoy;

CREATE VIEW v_stock_psicotropicos_hoy AS
WITH movs AS (
  SELECT
    supervision,
    inventario_id,
    SUM(CASE WHEN tipo='recibido'  AND turno='M' THEN cantidad ELSE 0 END) AS recibido_m,
    SUM(CASE WHEN tipo='recibido'  AND turno='V' THEN cantidad ELSE 0 END) AS recibido_v,
    SUM(CASE WHEN tipo='recibido'  AND turno='N' THEN cantidad ELSE 0 END) AS recibido_n,
    SUM(CASE WHEN tipo='surtido'   AND turno='M' THEN cantidad ELSE 0 END) AS surtido_m,
    SUM(CASE WHEN tipo='surtido'   AND turno='V' THEN cantidad ELSE 0 END) AS surtido_v,
    SUM(CASE WHEN tipo='surtido'   AND turno='N' THEN cantidad ELSE 0 END) AS surtido_n,
    SUM(CASE WHEN tipo='utilizado' AND turno='M' THEN cantidad ELSE 0 END) AS utilizado_m,
    SUM(CASE WHEN tipo='utilizado' AND turno='V' THEN cantidad ELSE 0 END) AS utilizado_v,
    SUM(CASE WHEN tipo='utilizado' AND turno='N' THEN cantidad ELSE 0 END) AS utilizado_n,
    SUM(CASE WHEN tipo='vale'      AND turno='M' THEN cantidad ELSE 0 END) AS vales_m,
    SUM(CASE WHEN tipo='vale'      AND turno='V' THEN cantidad ELSE 0 END) AS vales_v,
    SUM(CASE WHEN tipo='vale'      AND turno='N' THEN cantidad ELSE 0 END) AS vales_n
  FROM movimientos_psicotropicos
  WHERE fecha = (NOW() AT TIME ZONE 'America/Mazatlan')::date
    AND supervision IS NOT NULL
  GROUP BY supervision, inventario_id
),
eff AS (
  SELECT
    ff.supervision,
    ff.inventario_id,
    ff.fondo_fijo,
    ff.fecha_caducidad,
    -- per-turno efectivos: override (aj) si existe, si no el calculado, si no 0
    COALESCE(aj.recibido_m,  m.recibido_m,  0) AS recibido_m,
    COALESCE(aj.recibido_v,  m.recibido_v,  0) AS recibido_v,
    COALESCE(aj.recibido_n,  m.recibido_n,  0) AS recibido_n,
    COALESCE(aj.surtido_m,   m.surtido_m,   0) AS surtido_m,
    COALESCE(aj.surtido_v,   m.surtido_v,   0) AS surtido_v,
    COALESCE(aj.surtido_n,   m.surtido_n,   0) AS surtido_n,
    COALESCE(aj.utilizado_m, m.utilizado_m, 0) AS utilizado_m,
    COALESCE(aj.utilizado_v, m.utilizado_v, 0) AS utilizado_v,
    COALESCE(aj.utilizado_n, m.utilizado_n, 0) AS utilizado_n,
    COALESCE(aj.vales_m,     m.vales_m,     0) AS vales_m,
    COALESCE(aj.vales_v,     m.vales_v,     0) AS vales_v,
    COALESCE(aj.vales_n,     m.vales_n,     0) AS vales_n,
    aj.stock_actual AS stock_override,
    (aj.inventario_id IS NOT NULL) AS es_ajuste_manual
  FROM fondo_fijo_psicotropicos ff
  LEFT JOIN movs m
    ON m.inventario_id = ff.inventario_id
   AND m.supervision   = ff.supervision
  LEFT JOIN ajuste_manual_psicotropicos aj
    ON aj.inventario_id = ff.inventario_id
   AND aj.supervision   = ff.supervision
   AND aj.fecha         = (NOW() AT TIME ZONE 'America/Mazatlan')::date
)
SELECT
  e.supervision,
  inv.id,
  inv.orden,
  inv.nombre,
  inv.presentacion,
  inv.unidad,
  e.fondo_fijo,
  e.fecha_caducidad,
  (e.recibido_m  + e.recibido_v  + e.recibido_n)  AS recibido_total,
  (e.surtido_m   + e.surtido_v   + e.surtido_n)   AS surtido_total,
  (e.utilizado_m + e.utilizado_v + e.utilizado_n) AS utilizado_total,
  (e.vales_m     + e.vales_v     + e.vales_n)     AS vales_total,
  e.recibido_m,  e.recibido_v,  e.recibido_n,
  e.surtido_m,   e.surtido_v,   e.surtido_n,
  e.utilizado_m, e.utilizado_v, e.utilizado_n,
  e.vales_m,     e.vales_v,     e.vales_n,
  e.es_ajuste_manual,
  e.stock_override,
  COALESCE(
    e.stock_override,
    e.fondo_fijo
      + (e.recibido_m  + e.recibido_v  + e.recibido_n)
      - (e.utilizado_m + e.utilizado_v + e.utilizado_n)
      - (e.surtido_m   + e.surtido_v   + e.surtido_n)
  ) AS stock_actual
FROM eff e
JOIN inventario_psicotropicos inv ON inv.id = e.inventario_id
WHERE inv.activo
ORDER BY e.supervision, inv.orden;

COMMENT ON VIEW v_stock_psicotropicos_hoy IS
  'Stock de psicotropicos por supervision (hoy, Mazatlan). Per-turno de recibido/surtido/utilizado/vales con override manual (ajuste_manual_psicotropicos). stock_actual = override si existe, si no fondo + recibido - utilizado - surtido. es_ajuste_manual marca el renglon en modo manual.';

GRANT SELECT ON v_stock_psicotropicos_hoy TO authenticated;

-- 4) RPC para GUARDAR el ajuste manual de un renglon (jefe/admin).
--    fondo_fijo -> baseline (fondo_fijo_psicotropicos); el resto -> override
--    del dia. Pasar NULL en una columna del override = "usar el calculado".
--    OJO: al guardar, el renglon entra en modo manual (los per-turno
--    guardados dejan de recalcularse hasta limpiar el ajuste).
CREATE OR REPLACE FUNCTION public.fn_guardar_ajuste_psico(
  _fecha         DATE,
  _supervision   SMALLINT,
  _inventario_id INTEGER,
  _fondo_fijo    INTEGER,   -- NULL = no tocar el baseline
  _recibido_m    INTEGER,
  _recibido_v    INTEGER,
  _recibido_n    INTEGER,
  _surtido_m     INTEGER,
  _surtido_v     INTEGER,
  _surtido_n     INTEGER,
  _utilizado_m   INTEGER,
  _utilizado_v   INTEGER,
  _utilizado_n   INTEGER,
  _vales_m       INTEGER,
  _vales_v       INTEGER,
  _vales_n       INTEGER,
  _stock_actual  INTEGER    -- NULL = calcular de las partes
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    UUID;
  _nombre TEXT;
BEGIN
  IF NOT public.fn_es_jefe_o_admin() THEN
    RAISE EXCEPTION 'Solo el jefe o el administrador del sistema pueden ajustar el fondo fijo de psicotropicos.';
  END IF;

  IF _supervision NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Supervision invalida: %', _supervision;
  END IF;

  _uid := auth.uid();
  SELECT nombre_completo INTO _nombre FROM perfiles WHERE id = _uid;

  -- fondo fijo: baseline por supervision (afecta todos los dias)
  IF _fondo_fijo IS NOT NULL THEN
    IF _fondo_fijo < 0 THEN
      RAISE EXCEPTION 'El fondo fijo no puede ser negativo.';
    END IF;
    UPDATE fondo_fijo_psicotropicos
       SET fondo_fijo = _fondo_fijo
     WHERE inventario_id = _inventario_id
       AND supervision   = _supervision;
  END IF;

  -- override por-dia del resto de columnas
  INSERT INTO ajuste_manual_psicotropicos (
    fecha, supervision, inventario_id,
    recibido_m, recibido_v, recibido_n,
    surtido_m,  surtido_v,  surtido_n,
    utilizado_m, utilizado_v, utilizado_n,
    vales_m, vales_v, vales_n,
    stock_actual, ajustado_por, ajustado_nombre, ajustado_en
  ) VALUES (
    _fecha, _supervision, _inventario_id,
    _recibido_m, _recibido_v, _recibido_n,
    _surtido_m,  _surtido_v,  _surtido_n,
    _utilizado_m, _utilizado_v, _utilizado_n,
    _vales_m, _vales_v, _vales_n,
    _stock_actual, _uid, _nombre, NOW()
  )
  ON CONFLICT (fecha, supervision, inventario_id) DO UPDATE SET
    recibido_m = EXCLUDED.recibido_m,
    recibido_v = EXCLUDED.recibido_v,
    recibido_n = EXCLUDED.recibido_n,
    surtido_m  = EXCLUDED.surtido_m,
    surtido_v  = EXCLUDED.surtido_v,
    surtido_n  = EXCLUDED.surtido_n,
    utilizado_m = EXCLUDED.utilizado_m,
    utilizado_v = EXCLUDED.utilizado_v,
    utilizado_n = EXCLUDED.utilizado_n,
    vales_m = EXCLUDED.vales_m,
    vales_v = EXCLUDED.vales_v,
    vales_n = EXCLUDED.vales_n,
    stock_actual = EXCLUDED.stock_actual,
    ajustado_por = EXCLUDED.ajustado_por,
    ajustado_nombre = EXCLUDED.ajustado_nombre,
    ajustado_en = EXCLUDED.ajustado_en;
END;
$$;

COMMENT ON FUNCTION public.fn_guardar_ajuste_psico IS
  'Guarda el ajuste manual de un renglon de psicotropicos (jefe/admin). fondo_fijo va al baseline; el resto al override del dia.';

-- 5) RPC para LIMPIAR el ajuste (volver al calculo automatico).
--    No toca el baseline fondo_fijo (eso es un cambio permanente aparte).
CREATE OR REPLACE FUNCTION public.fn_limpiar_ajuste_psico(
  _fecha         DATE,
  _supervision   SMALLINT,
  _inventario_id INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_es_jefe_o_admin() THEN
    RAISE EXCEPTION 'Solo el jefe o el administrador del sistema pueden limpiar ajustes de psicotropicos.';
  END IF;

  DELETE FROM ajuste_manual_psicotropicos
   WHERE fecha = _fecha
     AND supervision = _supervision
     AND inventario_id = _inventario_id;
END;
$$;

COMMENT ON FUNCTION public.fn_limpiar_ajuste_psico IS
  'Borra el ajuste manual de un renglon (vuelve al calculo automatico). No toca el baseline fondo_fijo.';

GRANT EXECUTE ON FUNCTION public.fn_guardar_ajuste_psico(
  DATE, SMALLINT, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_limpiar_ajuste_psico(
  DATE, SMALLINT, INTEGER
) TO authenticated;

-- 6) POST-CHECK: la vista debe traer las nuevas columnas y seguir dando
--    12 medicamentos por supervision. (Sin ajustes, todo igual que antes.)
SELECT supervision, nombre, fondo_fijo,
       recibido_total, surtido_total, utilizado_total, vales_total,
       recibido_m, surtido_m, es_ajuste_manual, stock_actual
FROM v_stock_psicotropicos_hoy
ORDER BY supervision, orden;

COMMIT;
