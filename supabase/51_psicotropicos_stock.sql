-- ============================================================
-- Migración 51: Inventario y movimientos de psicotrópicos
-- ============================================================
-- Modelo:
--   - inventario_psicotropicos: 12 medicamentos con fondo fijo del PDF
--   - movimientos_psicotropicos: log de entradas/salidas por día+turno
--     (surtido, recibido, utilizado, vale). 1 fila por evento.
--   - Trigger: cuando una receta_controlada pasa a 'canjeada', se
--     inserta automáticamente un movimiento de 'utilizado' (salida).
--   - Vista v_stock_psicotropicos_hoy: stock actual calculado
--     dinámicamente desde fondo_fijo - salidas + entradas del día.
-- ============================================================

-- 1) Inventario (12 medicamentos del PDF)
CREATE TABLE IF NOT EXISTS inventario_psicotropicos (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL UNIQUE,
  presentacion  TEXT,
  unidad        TEXT NOT NULL DEFAULT 'Amp',   -- Amp, Tabletas, etc.
  fondo_fijo    INTEGER NOT NULL DEFAULT 0,
  grupo_control TEXT CHECK (grupo_control IS NULL OR grupo_control IN ('I','II','III','IV','V')),
  fecha_caducidad DATE,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  orden         INTEGER NOT NULL DEFAULT 0,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Las 12 entradas del PDF
INSERT INTO inventario_psicotropicos (nombre, presentacion, unidad, fondo_fijo, orden) VALUES
  ('Diazepam',     'Solución inyectable 10 mg/2 ml',                    'Amp',      20,  1),
  ('Nalbufina',    'Solución inyectable 10 mg/ml',                       'Amp',      10,  2),
  ('Buprenorfina', 'Solución inyectable 0.30 mg/ml frasco ampula/1 ml',  'Amp',      20,  3),
  ('Haloperidol',  'Solución inyectable 5 mg/ml ampolletas con un ml',   'Amp',      30,  4),
  ('Midazolam',    'Solución inyectable 15 mg/3 ml. Ampolletas c/3 ml',  'Amp',     120,  5),
  ('Propofol',     'Emulsión iny 200 mg Solución Amp de 20 ml',          'Amp',     120,  6),
  ('Fentanilo',    'Solución inyectable 0.5mg/10ml ampolletas c/10 ml',  'Amp',      60,  7),
  ('Morfina',      'Solución inyectable 10 mg/ml',                       'Amp',      10,  8),
  ('Flumazenil',   'Solución inyectable 0.5mg/5 ml ampolleta',           'Amp',       3,  9),
  ('Amitriptilina','Tabletas 25 mg',                                     'Tabletas', 50, 10),
  ('Lorazepam',    'Tabletas 1 mg',                                      'Tabletas', 40, 11),
  ('Clonazepam',   'Tabletas 2 mg',                                      'Tabletas', 30, 12)
ON CONFLICT (nombre) DO NOTHING;

-- 2) Movimientos
CREATE TABLE IF NOT EXISTS movimientos_psicotropicos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha             DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Mazatlan')::date,
  turno             TEXT NOT NULL CHECK (turno IN ('M','V','N')),
  inventario_id     INTEGER NOT NULL REFERENCES inventario_psicotropicos(id),
  tipo              TEXT NOT NULL CHECK (tipo IN ('surtido','recibido','utilizado','vale')),
  cantidad          INTEGER NOT NULL CHECK (cantidad > 0),
  receta_id         UUID REFERENCES recetas_controladas(id),  -- si tipo='utilizado' o 'vale'
  servicio_id       INTEGER REFERENCES servicios(id),
  observaciones     TEXT,
  capturado_por     UUID NOT NULL REFERENCES perfiles(id),
  capturado_nombre  TEXT NOT NULL,
  capturado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_psico_fecha_turno
  ON movimientos_psicotropicos(fecha DESC, turno, inventario_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_psico_receta
  ON movimientos_psicotropicos(receta_id);

COMMENT ON TABLE movimientos_psicotropicos IS
  'Log de movimientos del stock de psicotrópicos. 1 fila por evento (M/V/N · surtido/recibido/utilizado/vale).';

-- 3) Trigger: al canjear un vale, registrar utilizado automáticamente
CREATE OR REPLACE FUNCTION fn_registrar_canje_psicotropico()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _inv_id  INTEGER;
  _qty     INTEGER;
BEGIN
  -- Solo cuando pasa a 'canjeada'
  IF NEW.estado_aprobacion <> 'canjeada' OR
     (TG_OP = 'UPDATE' AND OLD.estado_aprobacion = 'canjeada') THEN
    RETURN NEW;
  END IF;

  -- Buscar el medicamento en inventario por nombre (case-insensitive, ILIKE)
  -- El medicamento_nombre de la receta es el del catálogo completo,
  -- el inventario tiene solo el nombre genérico.
  SELECT id INTO _inv_id
  FROM inventario_psicotropicos
  WHERE activo
    AND NEW.medicamento_nombre ILIKE '%' || nombre || '%'
  ORDER BY length(nombre) DESC  -- match el nombre más largo (más específico)
  LIMIT 1;

  IF _inv_id IS NULL THEN
    -- No está en inventario controlado central (puede ser ajeno al fondo fijo)
    RETURN NEW;
  END IF;

  -- Cantidad del vale (cantidad_numero es text, intentar convertir)
  BEGIN
    _qty := COALESCE(NULLIF(regexp_replace(NEW.cantidad_numero, '\D', '', 'g'), '')::INTEGER, 1);
  EXCEPTION WHEN OTHERS THEN
    _qty := 1;
  END;

  INSERT INTO movimientos_psicotropicos
    (fecha, turno, inventario_id, tipo, cantidad, receta_id, servicio_id,
     observaciones, capturado_por, capturado_nombre)
  VALUES (
    (COALESCE(NEW.canjeado_en, NOW()) AT TIME ZONE 'America/Mazatlan')::date,
    fn_turno_de_fecha(COALESCE(NEW.canjeado_en, NOW())),
    _inv_id,
    'utilizado',
    _qty,
    NEW.id,
    NEW.servicio_id,
    'Canje automático del vale ' || NEW.folio,
    COALESCE(NEW.aprobado_por, NEW.enfermera_id),
    COALESCE(NEW.aprobado_nombre, NEW.enfermera_nombre)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canje_psicotropico ON recetas_controladas;
CREATE TRIGGER trg_canje_psicotropico
  AFTER UPDATE OF estado_aprobacion ON recetas_controladas
  FOR EACH ROW EXECUTE FUNCTION fn_registrar_canje_psicotropico();

-- 4) Vista de stock actual (por día, calculado dinámicamente)
CREATE OR REPLACE VIEW v_stock_psicotropicos_hoy AS
WITH movs AS (
  SELECT
    inventario_id,
    SUM(CASE WHEN tipo = 'recibido' THEN cantidad ELSE 0 END) AS recibido_total,
    SUM(CASE WHEN tipo = 'surtido'  THEN cantidad ELSE 0 END) AS surtido_total,
    SUM(CASE WHEN tipo = 'utilizado' THEN cantidad ELSE 0 END) AS utilizado_total,
    SUM(CASE WHEN tipo = 'vale' THEN cantidad ELSE 0 END) AS vales_total,
    -- Por turno
    SUM(CASE WHEN tipo = 'utilizado' AND turno = 'M' THEN cantidad ELSE 0 END) AS utilizado_m,
    SUM(CASE WHEN tipo = 'utilizado' AND turno = 'V' THEN cantidad ELSE 0 END) AS utilizado_v,
    SUM(CASE WHEN tipo = 'utilizado' AND turno = 'N' THEN cantidad ELSE 0 END) AS utilizado_n,
    SUM(CASE WHEN tipo = 'vale' AND turno = 'M' THEN cantidad ELSE 0 END) AS vales_m,
    SUM(CASE WHEN tipo = 'vale' AND turno = 'V' THEN cantidad ELSE 0 END) AS vales_v,
    SUM(CASE WHEN tipo = 'vale' AND turno = 'N' THEN cantidad ELSE 0 END) AS vales_n
  FROM movimientos_psicotropicos
  WHERE fecha = (NOW() AT TIME ZONE 'America/Mazatlan')::date
  GROUP BY inventario_id
)
SELECT
  inv.id,
  inv.orden,
  inv.nombre,
  inv.presentacion,
  inv.unidad,
  inv.fondo_fijo,
  inv.fecha_caducidad,
  COALESCE(m.recibido_total, 0) AS recibido_total,
  COALESCE(m.surtido_total, 0)  AS surtido_total,
  COALESCE(m.utilizado_total, 0) AS utilizado_total,
  COALESCE(m.vales_total, 0)     AS vales_total,
  COALESCE(m.utilizado_m, 0)     AS utilizado_m,
  COALESCE(m.utilizado_v, 0)     AS utilizado_v,
  COALESCE(m.utilizado_n, 0)     AS utilizado_n,
  COALESCE(m.vales_m, 0)         AS vales_m,
  COALESCE(m.vales_v, 0)         AS vales_v,
  COALESCE(m.vales_n, 0)         AS vales_n,
  inv.fondo_fijo
    + COALESCE(m.recibido_total, 0)
    - COALESCE(m.utilizado_total, 0)
    - COALESCE(m.surtido_total, 0)
    AS stock_actual
FROM inventario_psicotropicos inv
LEFT JOIN movs m ON m.inventario_id = inv.id
WHERE inv.activo
ORDER BY inv.orden;

COMMENT ON VIEW v_stock_psicotropicos_hoy IS
  'Stock actual de psicotrópicos: fondo_fijo + recibido - utilizado - surtido (movimientos del día actual Mazatlán).';

-- 5) RLS
ALTER TABLE inventario_psicotropicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_psicotropicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_inv_psico_select ON inventario_psicotropicos;
CREATE POLICY p_inv_psico_select ON inventario_psicotropicos FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS p_mov_psico_select ON movimientos_psicotropicos;
CREATE POLICY p_mov_psico_select ON movimientos_psicotropicos FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS p_mov_psico_insert ON movimientos_psicotropicos;
CREATE POLICY p_mov_psico_insert ON movimientos_psicotropicos FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid()
            AND rol IN ('jefe','subjefe','supervisor') AND activo)
  );

DROP POLICY IF EXISTS p_mov_psico_update ON movimientos_psicotropicos;
CREATE POLICY p_mov_psico_update ON movimientos_psicotropicos FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid()
            AND rol IN ('jefe','subjefe','supervisor') AND activo)
  );

-- 6) Folio de salida (cuando el supervisor entrega físicamente a la jefa)
ALTER TABLE recetas_controladas
  ADD COLUMN IF NOT EXISTS folio_salida TEXT,
  ADD COLUMN IF NOT EXISTS entregado_jefa_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entregado_jefa_por UUID REFERENCES perfiles(id);

COMMENT ON COLUMN recetas_controladas.folio_salida IS
  'Folio asignado al momento de entregar físicamente a la jefatura de enfermería (cierre del ciclo de canje).';

-- 7) POST-CHECK
SELECT 'medicamentos inventario' AS check, COUNT(*) FROM inventario_psicotropicos
UNION ALL
SELECT 'movimientos hasta hoy', COUNT(*) FROM movimientos_psicotropicos
UNION ALL
SELECT 'vista stock funciona', COUNT(*) FROM v_stock_psicotropicos_hoy;
