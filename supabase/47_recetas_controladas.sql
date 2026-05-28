-- ============================================================
-- Migración 47: Recetas de medicamentos controlados
-- ============================================================
-- Tabla nueva para recetas de Grupo I-V (LGS), con folio auto,
-- snapshot de datos del paciente (no se rompe si egresa o cambia
-- cama), médico de texto libre, RLS solo gestor+, trazabilidad.
--
-- Header impreso (todos los servicios):
--   BENEMERITO HOSPITAL GENERAL CON ESPECIALIDADES
--   IMSS-BIENESTAR "JUAN MARIA DE SALVATIERRA"
--   CLUES BSIMB000672
-- ============================================================

-- 1) Marcar grupo de control en catalogo_medicamentos
ALTER TABLE catalogo_medicamentos
  ADD COLUMN IF NOT EXISTS grupo_control TEXT
    CHECK (grupo_control IS NULL OR grupo_control IN ('I','II','III','IV','V'));

COMMENT ON COLUMN catalogo_medicamentos.grupo_control IS
  'Grupo I-V según LGS para medicamentos controlados. NULL = no controlado.';

-- Pre-clasificación inicial basada en nombre. Mejor esfuerzo — falta
-- revisión farmacéutica para clasificar precisamente los 594.

-- Grupo I (narcóticos / estupefacientes)
UPDATE catalogo_medicamentos SET grupo_control = 'I'
WHERE grupo_control IS NULL AND (
  nombre ILIKE '%morfina%' OR
  nombre ILIKE '%fentanil%' OR
  nombre ILIKE '%buprenorfin%' OR
  nombre ILIKE '%codein%' OR
  nombre ILIKE '%hidromorfon%' OR
  nombre ILIKE '%metadona%' OR
  nombre ILIKE '%oxicodon%' OR
  nombre ILIKE '%nalbufin%' OR
  nombre ILIKE '%petidin%' OR
  nombre ILIKE '%meperidin%' OR
  nombre ILIKE '%sufentanil%' OR
  nombre ILIKE '%remifentanil%' OR
  nombre ILIKE '%dextropropoxifen%' OR
  nombre ILIKE '%nalmefen%'
);

-- Grupo II (psicotrópicos potentes)
UPDATE catalogo_medicamentos SET grupo_control = 'II'
WHERE grupo_control IS NULL AND (
  nombre ILIKE '%metilfenidat%' OR
  nombre ILIKE '%anfetamin%' OR
  nombre ILIKE '%dexanfetamin%' OR
  nombre ILIKE '%pentobarbital%' OR
  nombre ILIKE '%secobarbital%' OR
  nombre ILIKE '%amobarbital%' OR
  nombre ILIKE '%ketamin%'
);

-- Grupo III (psicotrópicos benzodiacepinas y similares)
UPDATE catalogo_medicamentos SET grupo_control = 'III'
WHERE grupo_control IS NULL AND (
  nombre ILIKE '%diazepam%' OR
  nombre ILIKE '%midazolam%' OR
  nombre ILIKE '%lorazepam%' OR
  nombre ILIKE '%alprazolam%' OR
  nombre ILIKE '%clonazepam%' OR
  nombre ILIKE '%bromazepam%' OR
  nombre ILIKE '%flunitrazepam%' OR
  nombre ILIKE '%triazolam%' OR
  nombre ILIKE '%fenobarbital%' OR
  nombre ILIKE '%tramadol%' OR
  nombre ILIKE '%clordiazep%' OR
  nombre ILIKE '%nitrazepam%' OR
  nombre ILIKE '%zolpidem%' OR
  nombre ILIKE '%zopiclon%'
);

-- 2) Tabla de recetas controladas
CREATE TABLE IF NOT EXISTS recetas_controladas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio             TEXT NOT NULL UNIQUE,
  -- Snapshot del paciente (no se rompe si egresa o cambia cama)
  paciente_id       UUID REFERENCES pacientes(id) ON DELETE SET NULL,
  paciente_nombre   TEXT NOT NULL,
  paciente_edad     SMALLINT,
  paciente_edad_unidad TEXT,
  paciente_genero   TEXT,
  paciente_nss_curp TEXT,
  paciente_diagnostico TEXT,
  paciente_cama     TEXT,
  paciente_subservicio TEXT,
  servicio_id       INTEGER REFERENCES servicios(id),
  -- Medicamento
  medicamento_id    INTEGER REFERENCES catalogo_medicamentos(id),
  medicamento_nombre TEXT NOT NULL,
  medicamento_grupo TEXT NOT NULL CHECK (medicamento_grupo IN ('I','II','III','IV','V')),
  dosis             TEXT,
  via               TEXT,
  frecuencia        TEXT,
  duracion          TEXT,
  cantidad_numero   TEXT,
  cantidad_letra    TEXT,
  indicaciones      TEXT,
  -- Médico prescriptor (texto libre)
  medico_nombre     TEXT,
  medico_cedula     TEXT,
  medico_especialidad TEXT,
  -- Personal de enfermería (auto-llenado del perfil que crea)
  enfermera_id      UUID NOT NULL REFERENCES perfiles(id),
  enfermera_nombre  TEXT NOT NULL,
  enfermera_matricula TEXT,
  enfermera_rol     TEXT,
  -- Auditoría
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelada_en      TIMESTAMPTZ,
  cancelada_por     UUID REFERENCES perfiles(id),
  cancelada_motivo  TEXT
);

CREATE INDEX IF NOT EXISTS idx_recetas_controladas_paciente ON recetas_controladas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_recetas_controladas_enfermera ON recetas_controladas(enfermera_id);
CREATE INDEX IF NOT EXISTS idx_recetas_controladas_creado ON recetas_controladas(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_recetas_controladas_folio ON recetas_controladas(folio);

COMMENT ON TABLE recetas_controladas IS
  'Recetas de medicamentos controlados (Grupos I-V LGS). Datos del paciente como snapshot. Folio auto-generado.';

-- 3) Folio automático: BSIMB-YYYY-NNNNN (CLUES + año + secuencia)
CREATE SEQUENCE IF NOT EXISTS seq_folio_receta_controlada START 1;

CREATE OR REPLACE FUNCTION fn_generar_folio_receta_controlada()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    NEW.folio := 'BSIMB-' || EXTRACT(YEAR FROM NOW())::TEXT
                 || '-' || LPAD(nextval('seq_folio_receta_controlada')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_folio_receta_controlada ON recetas_controladas;
CREATE TRIGGER trg_folio_receta_controlada
  BEFORE INSERT ON recetas_controladas
  FOR EACH ROW
  EXECUTE FUNCTION fn_generar_folio_receta_controlada();

-- 4) Trigger updated_at
CREATE OR REPLACE FUNCTION fn_set_actualizado_en()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recetas_controladas_updated ON recetas_controladas;
CREATE TRIGGER trg_recetas_controladas_updated
  BEFORE UPDATE ON recetas_controladas
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- 5) Auditoría automática
DROP TRIGGER IF EXISTS trg_auditar_recetas_controladas ON recetas_controladas;
CREATE TRIGGER trg_auditar_recetas_controladas
  AFTER INSERT OR UPDATE OR DELETE ON recetas_controladas
  FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();

-- 6) RLS — solo gestor+ pueden ver/crear; cualquiera autenticado lee solo
--    si la receta es de un paciente de su servicio (igual que recetario).
ALTER TABLE recetas_controladas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_recetas_controladas_select ON recetas_controladas;
CREATE POLICY p_recetas_controladas_select
  ON recetas_controladas FOR SELECT
  TO authenticated
  USING (
    fn_es_admin_global()
    OR EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid()
        AND rol = 'gestor'
        AND servicio_id = recetas_controladas.servicio_id
    )
  );

DROP POLICY IF EXISTS p_recetas_controladas_insert ON recetas_controladas;
CREATE POLICY p_recetas_controladas_insert
  ON recetas_controladas FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid()
        AND rol IN ('jefe','subjefe','supervisor','gestor')
        AND activo
    )
  );

DROP POLICY IF EXISTS p_recetas_controladas_update ON recetas_controladas;
CREATE POLICY p_recetas_controladas_update
  ON recetas_controladas FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid()
        AND rol IN ('jefe','subjefe','supervisor','gestor')
        AND activo
    )
  );

-- DELETE bloqueado para todos. Para "borrar" se cancela.
DROP POLICY IF EXISTS p_recetas_controladas_delete ON recetas_controladas;
CREATE POLICY p_recetas_controladas_delete
  ON recetas_controladas FOR DELETE
  TO authenticated
  USING (false);

-- 7) POST-CHECK
SELECT 'medicamentos controlados Grupo I' AS check, COUNT(*) AS total
  FROM catalogo_medicamentos WHERE grupo_control = 'I'
UNION ALL
SELECT 'medicamentos controlados Grupo II', COUNT(*)
  FROM catalogo_medicamentos WHERE grupo_control = 'II'
UNION ALL
SELECT 'medicamentos controlados Grupo III', COUNT(*)
  FROM catalogo_medicamentos WHERE grupo_control = 'III'
UNION ALL
SELECT 'tabla recetas_controladas existe',
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_name='recetas_controladas')::bigint
UNION ALL
SELECT 'policies activas',
  COUNT(*)::bigint FROM pg_policies WHERE tablename='recetas_controladas';
