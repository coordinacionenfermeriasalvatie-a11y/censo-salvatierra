-- ============================================================
-- Migracion 65: Fondo fijo de psicotropicos POR SUPERVISION
-- ============================================================
-- Hasta ahora habia UN solo fondo fijo global (inventario_psicotropicos.fondo_fijo)
-- y la vista de stock sumaba TODOS los movimientos sin distinguir supervision.
--
-- Esta migracion separa el stock por supervision (1 y 2):
--   - Nueva tabla fondo_fijo_psicotropicos(inventario_id, supervision, fondo_fijo, fecha_caducidad)
--       * Sup 1 = valores actuales (los de la migracion 51, copiados del inventario)
--       * Sup 2 = valores del formulario "SERVICIO: SUPERVISION II"
--   - Columna movimientos_psicotropicos.supervision (1/2) + backfill por servicio
--   - Trigger de canje: setea la supervision desde servicios.supervision del vale
--     (trazabilidad servicio -> supervision: el vale descuenta del fondo de SU supervision)
--   - Vista v_stock_psicotropicos_hoy reescrita: 1 fila por (supervision x medicamento)
--
-- La columna global inventario_psicotropicos.fondo_fijo SE CONSERVA (la usan las
-- vistas semanales/snapshots de la migracion 52). Aqui ya no se usa para el stock.
--
-- ASCII puro y lineas cortas (evita truncado al pegar en el SQL Editor).
-- Idempotente: se puede correr varias veces. Re-correr RESETEA a estos valores.
-- ============================================================
BEGIN;

-- 1) Tabla de fondo fijo por supervision
CREATE TABLE IF NOT EXISTS fondo_fijo_psicotropicos (
  inventario_id   INTEGER  NOT NULL REFERENCES inventario_psicotropicos(id),
  supervision     SMALLINT NOT NULL CHECK (supervision IN (1, 2)),
  fondo_fijo      INTEGER  NOT NULL DEFAULT 0 CHECK (fondo_fijo >= 0),
  fecha_caducidad DATE,
  PRIMARY KEY (inventario_id, supervision)
);

COMMENT ON TABLE fondo_fijo_psicotropicos IS
  'Fondo fijo (stock base) de psicotropicos por supervision. Fuente de verdad del stock; reemplaza al fondo_fijo global.';

-- 2a) Seed Supervision 1 = valores actuales (copiados del inventario global)
INSERT INTO fondo_fijo_psicotropicos (inventario_id, supervision, fondo_fijo, fecha_caducidad)
SELECT id, 1, fondo_fijo, fecha_caducidad
FROM inventario_psicotropicos
ON CONFLICT (inventario_id, supervision)
DO UPDATE SET fondo_fijo      = EXCLUDED.fondo_fijo,
              fecha_caducidad = EXCLUDED.fecha_caducidad;

-- 2b) Seed Supervision 2 = formulario "SERVICIO: SUPERVISION II" (por nombre)
INSERT INTO fondo_fijo_psicotropicos (inventario_id, supervision, fondo_fijo)
SELECT inv.id, 2, v.ff
FROM (VALUES
  ('Diazepam',     10),
  ('Nalbufina',     3),
  ('Buprenorfina',  7),
  ('Haloperidol',  10),
  ('Midazolam',    50),
  ('Propofol',     35),
  ('Fentanilo',    26),
  ('Morfina',       5),
  ('Flumazenil',   10),
  ('Amitriptilina',10),
  ('Lorazepam',    10),
  ('Clonazepam',   10)
) AS v(nombre, ff)
JOIN inventario_psicotropicos inv ON inv.nombre = v.nombre
ON CONFLICT (inventario_id, supervision)
DO UPDATE SET fondo_fijo = EXCLUDED.fondo_fijo;

-- 3) Columna supervision en movimientos + backfill por servicio
ALTER TABLE movimientos_psicotropicos
  ADD COLUMN IF NOT EXISTS supervision SMALLINT
  CHECK (supervision IS NULL OR supervision IN (1, 2));

COMMENT ON COLUMN movimientos_psicotropicos.supervision IS
  'Supervision a la que se atribuye el movimiento. En vales/utilizado se deriva del servicio; en recibido/surtido manual lo fija la app.';

CREATE INDEX IF NOT EXISTS idx_movimientos_psico_sup
  ON movimientos_psicotropicos(fecha DESC, supervision, inventario_id);

-- Backfill: deriva la supervision del servicio del movimiento
UPDATE movimientos_psicotropicos m
SET supervision = s.supervision
FROM servicios s
WHERE m.servicio_id = s.id
  AND m.supervision IS NULL
  AND s.supervision IS NOT NULL;

-- 4) Trigger de canje: ahora tambien setea supervision (trazabilidad del servicio)
CREATE OR REPLACE FUNCTION fn_registrar_canje_psicotropico()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _inv_id  INTEGER;
  _qty     INTEGER;
  _sup     SMALLINT;
BEGIN
  -- Solo cuando pasa a 'canjeada'
  IF NEW.estado_aprobacion <> 'canjeada' OR
     (TG_OP = 'UPDATE' AND OLD.estado_aprobacion = 'canjeada') THEN
    RETURN NEW;
  END IF;

  -- Medicamento en inventario por nombre (match mas largo = mas especifico)
  SELECT id INTO _inv_id
  FROM inventario_psicotropicos
  WHERE activo
    AND NEW.medicamento_nombre ILIKE '%' || nombre || '%'
  ORDER BY length(nombre) DESC
  LIMIT 1;

  IF _inv_id IS NULL THEN
    RETURN NEW;  -- ajeno al fondo fijo controlado
  END IF;

  -- Cantidad (cantidad_numero es text)
  BEGIN
    _qty := COALESCE(NULLIF(regexp_replace(NEW.cantidad_numero, '\D', '', 'g'), '')::INTEGER, 1);
  EXCEPTION WHEN OTHERS THEN
    _qty := 1;
  END;

  -- Supervision a la que pertenece el servicio del vale
  SELECT supervision INTO _sup FROM servicios WHERE id = NEW.servicio_id;

  INSERT INTO movimientos_psicotropicos
    (fecha, turno, inventario_id, tipo, cantidad, receta_id, servicio_id, supervision,
     observaciones, capturado_por, capturado_nombre)
  VALUES (
    (COALESCE(NEW.canjeado_en, NOW()) AT TIME ZONE 'America/Mazatlan')::date,
    fn_turno_de_fecha(COALESCE(NEW.canjeado_en, NOW())),
    _inv_id,
    'utilizado',
    _qty,
    NEW.id,
    NEW.servicio_id,
    _sup,
    'Canje automatico del vale ' || NEW.folio,
    COALESCE(NEW.aprobado_por, NEW.enfermera_id),
    COALESCE(NEW.aprobado_nombre, NEW.enfermera_nombre)
  );

  RETURN NEW;
END;
$$;

-- (el trigger trg_canje_psicotropico ya existe y apunta a esta funcion)

-- 5) Vista de stock reescrita: 1 fila por (supervision x medicamento)
DROP VIEW IF EXISTS v_stock_psicotropicos_hoy;

CREATE VIEW v_stock_psicotropicos_hoy AS
WITH movs AS (
  SELECT
    supervision,
    inventario_id,
    SUM(CASE WHEN tipo = 'recibido'  THEN cantidad ELSE 0 END) AS recibido_total,
    SUM(CASE WHEN tipo = 'surtido'   THEN cantidad ELSE 0 END) AS surtido_total,
    SUM(CASE WHEN tipo = 'utilizado' THEN cantidad ELSE 0 END) AS utilizado_total,
    SUM(CASE WHEN tipo = 'vale'      THEN cantidad ELSE 0 END) AS vales_total,
    SUM(CASE WHEN tipo = 'utilizado' AND turno = 'M' THEN cantidad ELSE 0 END) AS utilizado_m,
    SUM(CASE WHEN tipo = 'utilizado' AND turno = 'V' THEN cantidad ELSE 0 END) AS utilizado_v,
    SUM(CASE WHEN tipo = 'utilizado' AND turno = 'N' THEN cantidad ELSE 0 END) AS utilizado_n,
    SUM(CASE WHEN tipo = 'vale' AND turno = 'M' THEN cantidad ELSE 0 END) AS vales_m,
    SUM(CASE WHEN tipo = 'vale' AND turno = 'V' THEN cantidad ELSE 0 END) AS vales_v,
    SUM(CASE WHEN tipo = 'vale' AND turno = 'N' THEN cantidad ELSE 0 END) AS vales_n
  FROM movimientos_psicotropicos
  WHERE fecha = (NOW() AT TIME ZONE 'America/Mazatlan')::date
    AND supervision IS NOT NULL
  GROUP BY supervision, inventario_id
)
SELECT
  ff.supervision,
  inv.id,
  inv.orden,
  inv.nombre,
  inv.presentacion,
  inv.unidad,
  ff.fondo_fijo,
  ff.fecha_caducidad,
  COALESCE(m.recibido_total, 0)  AS recibido_total,
  COALESCE(m.surtido_total, 0)   AS surtido_total,
  COALESCE(m.utilizado_total, 0) AS utilizado_total,
  COALESCE(m.vales_total, 0)     AS vales_total,
  COALESCE(m.utilizado_m, 0)     AS utilizado_m,
  COALESCE(m.utilizado_v, 0)     AS utilizado_v,
  COALESCE(m.utilizado_n, 0)     AS utilizado_n,
  COALESCE(m.vales_m, 0)         AS vales_m,
  COALESCE(m.vales_v, 0)         AS vales_v,
  COALESCE(m.vales_n, 0)         AS vales_n,
  ff.fondo_fijo
    + COALESCE(m.recibido_total, 0)
    - COALESCE(m.utilizado_total, 0)
    - COALESCE(m.surtido_total, 0)
    AS stock_actual
FROM fondo_fijo_psicotropicos ff
JOIN inventario_psicotropicos inv ON inv.id = ff.inventario_id
LEFT JOIN movs m ON m.inventario_id = ff.inventario_id
                AND m.supervision   = ff.supervision
WHERE inv.activo
ORDER BY ff.supervision, inv.orden;

COMMENT ON VIEW v_stock_psicotropicos_hoy IS
  'Stock de psicotropicos por supervision: fondo_fijo(supervision) + recibido - utilizado - surtido (movimientos del dia, Mazatlan). Filtrar por supervision desde el frontend.';

GRANT SELECT ON v_stock_psicotropicos_hoy TO authenticated;

-- 6) RLS de la nueva tabla (lectura para autenticados, igual que el inventario)
ALTER TABLE fondo_fijo_psicotropicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ff_psico_select ON fondo_fijo_psicotropicos;
CREATE POLICY p_ff_psico_select ON fondo_fijo_psicotropicos FOR SELECT
  TO authenticated USING (true);

-- 7) POST-CHECK: fondo fijo por supervision (debe dar 12 filas por supervision)
SELECT ff.supervision, inv.orden, inv.nombre, ff.fondo_fijo
FROM fondo_fijo_psicotropicos ff
JOIN inventario_psicotropicos inv ON inv.id = ff.inventario_id
ORDER BY ff.supervision, inv.orden;

COMMIT;
