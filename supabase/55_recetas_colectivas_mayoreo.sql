-- ============================================================
-- Migración 55: Recetario colectivo "a mayoreo"
-- ============================================================
-- Solicitud de medicamentos a granel (NO por paciente) para los
-- servicios de Urgencias y Tococirugía. Convive con el recetario
-- por paciente y la receta controlada (no los reemplaza).
--
-- Estructura header + detalle:
--   recetas_colectivas_mayoreo        -> 1 solicitud (folio, servicio, solicitante)
--   recetas_colectivas_mayoreo_items  -> N medicamentos de esa solicitud
--
-- Folio auto: BSIMB-MAY-YYYY-NNNNN (distinto al de receta controlada).
-- Captura digital con dropdowns (no llenado a mano); por eso los
-- campos vía/frecuencia/cantidad se guardan como texto ya normalizado.
--
-- Header impreso (igual que los demás formatos):
--   BENEMÉRITO HOSPITAL GENERAL CON ESPECIALIDADES IMSS-BIENESTAR
--   "JUAN MARÍA DE SALVATIERRA" · CLUES BSIMB000672
-- ============================================================

BEGIN;

-- 1) Tabla cabecera ------------------------------------------------
CREATE TABLE IF NOT EXISTS recetas_colectivas_mayoreo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio           TEXT NOT NULL UNIQUE,
  servicio_id     INTEGER REFERENCES servicios(id),
  servicio_nombre TEXT NOT NULL,
  area            TEXT,            -- subservicio/área opcional (texto libre)
  observaciones   TEXT,
  -- Solicitante (snapshot del perfil que captura)
  solicitante_id        UUID NOT NULL REFERENCES perfiles(id),
  solicitante_nombre    TEXT NOT NULL,
  solicitante_matricula TEXT,
  solicitante_rol       TEXT,
  -- Auditoría
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelada_en     TIMESTAMPTZ,
  cancelada_por    UUID REFERENCES perfiles(id),
  cancelada_motivo TEXT
);

COMMENT ON TABLE recetas_colectivas_mayoreo IS
  'Solicitud colectiva de medicamentos a mayoreo (no por paciente). Folio auto. Urgencias y Tococirugía.';

-- 2) Tabla detalle (medicamentos) ---------------------------------
CREATE TABLE IF NOT EXISTS recetas_colectivas_mayoreo_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receta_id   UUID NOT NULL REFERENCES recetas_colectivas_mayoreo(id) ON DELETE CASCADE,
  orden       SMALLINT NOT NULL DEFAULT 1,
  medicamento_id     INTEGER REFERENCES catalogo_medicamentos(id),
  medicamento_nombre TEXT NOT NULL,
  dosis       TEXT,
  via         TEXT,
  frecuencia  TEXT,
  cantidad    TEXT     -- texto: admite unidades ("50", "10 cajas", "2 amp")
);

COMMENT ON TABLE recetas_colectivas_mayoreo_items IS
  'Renglones de medicamento de una solicitud colectiva a mayoreo.';

CREATE INDEX IF NOT EXISTS idx_rcm_servicio    ON recetas_colectivas_mayoreo(servicio_id);
CREATE INDEX IF NOT EXISTS idx_rcm_solicitante ON recetas_colectivas_mayoreo(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_rcm_creado      ON recetas_colectivas_mayoreo(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_rcm_folio       ON recetas_colectivas_mayoreo(folio);
CREATE INDEX IF NOT EXISTS idx_rcm_items_receta ON recetas_colectivas_mayoreo_items(receta_id);

-- 3) Folio automático: BSIMB-MAY-YYYY-NNNNN -----------------------
CREATE SEQUENCE IF NOT EXISTS seq_folio_receta_mayoreo START 1;

CREATE OR REPLACE FUNCTION fn_generar_folio_receta_mayoreo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    NEW.folio := 'BSIMB-MAY-' || EXTRACT(YEAR FROM NOW())::TEXT
                 || '-' || LPAD(nextval('seq_folio_receta_mayoreo')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_folio_receta_mayoreo ON recetas_colectivas_mayoreo;
CREATE TRIGGER trg_folio_receta_mayoreo
  BEFORE INSERT ON recetas_colectivas_mayoreo
  FOR EACH ROW
  EXECUTE FUNCTION fn_generar_folio_receta_mayoreo();

-- 4) updated_at (reutiliza fn_set_actualizado_en de migración 47) --
DROP TRIGGER IF EXISTS trg_rcm_updated ON recetas_colectivas_mayoreo;
CREATE TRIGGER trg_rcm_updated
  BEFORE UPDATE ON recetas_colectivas_mayoreo
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- 5) Auditoría automática (reutiliza fn_auditar_cambio) -----------
DROP TRIGGER IF EXISTS trg_auditar_rcm ON recetas_colectivas_mayoreo;
CREATE TRIGGER trg_auditar_rcm
  AFTER INSERT OR UPDATE OR DELETE ON recetas_colectivas_mayoreo
  FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();

-- 6) RLS -----------------------------------------------------------
-- Cabecera: ven admin global o gestor del mismo servicio; crean/editan
-- jefe/subjefe/supervisor/gestor activos; nadie borra (se cancela).
ALTER TABLE recetas_colectivas_mayoreo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_rcm_select ON recetas_colectivas_mayoreo;
CREATE POLICY p_rcm_select
  ON recetas_colectivas_mayoreo FOR SELECT
  TO authenticated
  USING (
    fn_es_admin_global()
    OR EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid()
        AND rol = 'gestor'
        AND servicio_id = recetas_colectivas_mayoreo.servicio_id
    )
  );

DROP POLICY IF EXISTS p_rcm_insert ON recetas_colectivas_mayoreo;
CREATE POLICY p_rcm_insert
  ON recetas_colectivas_mayoreo FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid()
        AND rol IN ('jefe','subjefe','supervisor','gestor')
        AND activo
    )
  );

DROP POLICY IF EXISTS p_rcm_update ON recetas_colectivas_mayoreo;
CREATE POLICY p_rcm_update
  ON recetas_colectivas_mayoreo FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid()
        AND rol IN ('jefe','subjefe','supervisor','gestor')
        AND activo
    )
  );

DROP POLICY IF EXISTS p_rcm_delete ON recetas_colectivas_mayoreo;
CREATE POLICY p_rcm_delete
  ON recetas_colectivas_mayoreo FOR DELETE
  TO authenticated
  USING (false);

-- Detalle: visible/insertable si la cabecera lo es. Sin update/delete
-- directo (los renglones se crean junto con la solicitud; ON DELETE
-- CASCADE limpia si algún día se borra la cabecera por proceso interno).
ALTER TABLE recetas_colectivas_mayoreo_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_rcm_items_select ON recetas_colectivas_mayoreo_items;
CREATE POLICY p_rcm_items_select
  ON recetas_colectivas_mayoreo_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recetas_colectivas_mayoreo r
      WHERE r.id = recetas_colectivas_mayoreo_items.receta_id
        AND (
          fn_es_admin_global()
          OR EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol = 'gestor'
              AND servicio_id = r.servicio_id
          )
        )
    )
  );

DROP POLICY IF EXISTS p_rcm_items_insert ON recetas_colectivas_mayoreo_items;
CREATE POLICY p_rcm_items_insert
  ON recetas_colectivas_mayoreo_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid()
        AND rol IN ('jefe','subjefe','supervisor','gestor')
        AND activo
    )
  );

-- 7) POST-CHECK ----------------------------------------------------
SELECT 'tabla recetas_colectivas_mayoreo existe' AS check,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_name='recetas_colectivas_mayoreo')::bigint AS total
UNION ALL
SELECT 'tabla recetas_colectivas_mayoreo_items existe',
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_name='recetas_colectivas_mayoreo_items')::bigint
UNION ALL
SELECT 'policies activas (cabecera+detalle)',
  COUNT(*)::bigint FROM pg_policies
  WHERE tablename IN ('recetas_colectivas_mayoreo','recetas_colectivas_mayoreo_items');

COMMIT;
