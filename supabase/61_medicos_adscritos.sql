-- ============================================================
-- Migración 61: Catálogo de médicos adscritos
-- ============================================================
-- Alimenta el dropdown de "Médico prescriptor" en la receta de
-- medicamento controlado (nombre completo → autocompleta cédula y
-- especialidad, ambas editables en el momento).
--
-- Se entrega VACÍO: la captura de médicos la hace el personal de
-- supervisión desde la pantalla de administración (Carpeta de
-- Supervisión → Médicos Adscritos).
-- ============================================================

CREATE TABLE IF NOT EXISTS medicos_adscritos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  cedula        TEXT,
  especialidad  TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  orden         INTEGER NOT NULL DEFAULT 0,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE medicos_adscritos IS
  'Catálogo de médicos adscritos para el dropdown de la receta controlada. Capturado manualmente por supervisión.';

CREATE INDEX IF NOT EXISTS idx_medicos_adscritos_activo
  ON medicos_adscritos(activo, orden, nombre);

-- Mantener actualizado_en al vuelo (reutiliza el helper existente).
DROP TRIGGER IF EXISTS trg_medicos_adscritos_updated ON medicos_adscritos;
CREATE TRIGGER trg_medicos_adscritos_updated
  BEFORE UPDATE ON medicos_adscritos
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ============================================================
-- RLS: lectura para cualquier autenticado (gestores llenan recetas);
-- altas/cambios/bajas solo para admin global (jefe/subjefe/supervisor).
-- ============================================================
ALTER TABLE medicos_adscritos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_medicos_adscritos_select ON medicos_adscritos;
CREATE POLICY p_medicos_adscritos_select
  ON medicos_adscritos FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS p_medicos_adscritos_insert ON medicos_adscritos;
CREATE POLICY p_medicos_adscritos_insert
  ON medicos_adscritos FOR INSERT
  TO authenticated
  WITH CHECK (fn_es_admin_global());

DROP POLICY IF EXISTS p_medicos_adscritos_update ON medicos_adscritos;
CREATE POLICY p_medicos_adscritos_update
  ON medicos_adscritos FOR UPDATE
  TO authenticated
  USING (fn_es_admin_global())
  WITH CHECK (fn_es_admin_global());

DROP POLICY IF EXISTS p_medicos_adscritos_delete ON medicos_adscritos;
CREATE POLICY p_medicos_adscritos_delete
  ON medicos_adscritos FOR DELETE
  TO authenticated
  USING (fn_es_admin_global());

-- POST-CHECK
SELECT 'tabla medicos_adscritos existe' AS check,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_name='medicos_adscritos')::bigint AS valor
UNION ALL
SELECT 'policies activas',
  COUNT(*)::bigint FROM pg_policies WHERE tablename='medicos_adscritos';
