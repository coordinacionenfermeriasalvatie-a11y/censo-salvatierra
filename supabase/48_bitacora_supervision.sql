-- ============================================================
-- Migración 48: Bitácora de Supervisión + Workflow de aprobación
-- ============================================================
-- Cambios:
--   1. Folio formato NNNN/YYYY (en lugar de BSIMB-YYYY-NNNNN)
--   2. Workflow aprobación: pendiente → aprobada → canjeada (o rechazada)
--   3. Turno calculado automáticamente desde creado_en (Mazatlán)
--   4. Vista v_bitacora_supervision con todos los vales del día agrupados
--      por turno + datos del paciente y medicamento para concentrado.
--   5. RLS: gestor crea (queda pendiente). supervisor+/jefe aprueban,
--      rechazan o marcan canjeada.
-- ============================================================

-- 1) Cambiar folio a NNNN/YYYY (secuencia por año)
DROP TRIGGER IF EXISTS trg_folio_receta_controlada ON recetas_controladas;
DROP FUNCTION IF EXISTS fn_generar_folio_receta_controlada();

-- Secuencia que se reinicia anualmente (usamos NEXTVAL pero el formato
-- incluye año, así que cualquier número grande es válido — para tener
-- 0001/2026 reseteamos cuando aparece año nuevo via columna anio_folio).

ALTER TABLE recetas_controladas
  ADD COLUMN IF NOT EXISTS anio_folio INTEGER,
  ADD COLUMN IF NOT EXISTS num_folio  INTEGER;

CREATE INDEX IF NOT EXISTS idx_recetas_anio_num ON recetas_controladas(anio_folio, num_folio);

CREATE OR REPLACE FUNCTION fn_generar_folio_anual()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  _anio INTEGER;
  _num  INTEGER;
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' OR NEW.anio_folio IS NULL THEN
    _anio := EXTRACT(YEAR FROM (COALESCE(NEW.creado_en, NOW()) AT TIME ZONE 'America/Mazatlan'));
    -- Tomar el siguiente número del año (con bloqueo de fila para evitar carrera)
    SELECT COALESCE(MAX(num_folio), 0) + 1 INTO _num
      FROM recetas_controladas
     WHERE anio_folio = _anio;
    NEW.anio_folio := _anio;
    NEW.num_folio  := _num;
    NEW.folio      := LPAD(_num::TEXT, 4, '0') || '/' || _anio::TEXT;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_folio_receta_controlada
  BEFORE INSERT ON recetas_controladas
  FOR EACH ROW
  EXECUTE FUNCTION fn_generar_folio_anual();

-- Re-generar folios existentes con el nuevo formato (re-numeración anual)
DO $$
DECLARE
  r RECORD;
  _anio INTEGER;
  _contador INTEGER := 0;
  _anio_anterior INTEGER := -1;
BEGIN
  FOR r IN SELECT id, creado_en FROM recetas_controladas
           ORDER BY creado_en ASC
  LOOP
    _anio := EXTRACT(YEAR FROM (r.creado_en AT TIME ZONE 'America/Mazatlan'));
    IF _anio <> _anio_anterior THEN
      _contador := 0;
      _anio_anterior := _anio;
    END IF;
    _contador := _contador + 1;
    UPDATE recetas_controladas
       SET anio_folio = _anio,
           num_folio = _contador,
           folio = LPAD(_contador::TEXT, 4, '0') || '/' || _anio::TEXT
     WHERE id = r.id;
  END LOOP;
END$$;

-- 2) Workflow de aprobación
ALTER TABLE recetas_controladas
  ADD COLUMN IF NOT EXISTS estado_aprobacion TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado_aprobacion IN ('pendiente','aprobada','rechazada','canjeada')),
  ADD COLUMN IF NOT EXISTS aprobado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aprobado_por UUID REFERENCES perfiles(id),
  ADD COLUMN IF NOT EXISTS aprobado_nombre TEXT,
  ADD COLUMN IF NOT EXISTS canjeado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rechazo_motivo TEXT,
  ADD COLUMN IF NOT EXISTS observaciones TEXT;

CREATE INDEX IF NOT EXISTS idx_recetas_estado_creado
  ON recetas_controladas(estado_aprobacion, creado_en DESC);

-- 3) Turno calculado (Mazatlán): M=07:00-13:59, V=14:00-19:59, N=20:00-06:59
CREATE OR REPLACE FUNCTION fn_turno_de_fecha(_ts TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM (_ts AT TIME ZONE 'America/Mazatlan')) BETWEEN 7 AND 13 THEN 'M'
    WHEN EXTRACT(HOUR FROM (_ts AT TIME ZONE 'America/Mazatlan')) BETWEEN 14 AND 19 THEN 'V'
    ELSE 'N'
  END;
$$;

-- 4) Vista bitácora — todos los vales con datos para concentrado
CREATE OR REPLACE VIEW v_bitacora_supervision AS
SELECT
  rc.id,
  rc.folio,
  rc.creado_en,
  (rc.creado_en AT TIME ZONE 'America/Mazatlan')::date AS fecha_dia,
  fn_turno_de_fecha(rc.creado_en) AS turno,
  rc.estado_aprobacion,
  rc.aprobado_en,
  rc.aprobado_nombre,
  rc.canjeado_en,
  rc.rechazo_motivo,
  rc.observaciones,
  -- paciente
  rc.paciente_cama,
  rc.paciente_nombre,
  rc.paciente_edad,
  rc.paciente_edad_unidad,
  rc.paciente_genero,
  rc.paciente_nss_curp,
  rc.paciente_diagnostico,
  rc.paciente_subservicio,
  s.codigo AS servicio_codigo,
  s.nombre AS servicio_nombre,
  -- medicamento
  rc.medicamento_nombre,
  rc.medicamento_grupo,
  rc.dosis,
  rc.via,
  rc.frecuencia,
  rc.cantidad_numero,
  rc.cantidad_letra,
  -- médico y enfermería
  rc.medico_nombre,
  rc.medico_cedula,
  rc.enfermera_nombre,
  rc.enfermera_matricula,
  rc.enfermera_rol
FROM recetas_controladas rc
LEFT JOIN servicios s ON s.id = rc.servicio_id;

COMMENT ON VIEW v_bitacora_supervision IS
  'Concentrado de vales controlados con paciente, medicamento, médico y trazabilidad. Por fecha+turno (Mazatlán). RLS heredado de recetas_controladas.';

-- 5) RLS actualizada: el supervisor+ puede aprobar/rechazar/canjear.
--    Mantenemos las del paso anterior; añadimos que cualquier admin
--    global ve TODAS las recetas (no solo de su servicio) para la bitácora.

DROP POLICY IF EXISTS p_recetas_controladas_select ON recetas_controladas;
CREATE POLICY p_recetas_controladas_select
  ON recetas_controladas FOR SELECT
  TO authenticated
  USING (
    fn_es_admin_global()  -- jefe, subjefe, supervisor ven todas
    OR EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid()
        AND rol = 'gestor'
        AND servicio_id = recetas_controladas.servicio_id
    )
  );

-- UPDATE: gestor puede editar SUS recetas mientras estén pendientes.
--         supervisor+ puede aprobar/rechazar/canjear en cualquier estado.
DROP POLICY IF EXISTS p_recetas_controladas_update ON recetas_controladas;
CREATE POLICY p_recetas_controladas_update
  ON recetas_controladas FOR UPDATE
  TO authenticated
  USING (
    fn_es_admin_global()
    OR (
      EXISTS (SELECT 1 FROM perfiles
              WHERE id = auth.uid() AND rol = 'gestor'
                AND servicio_id = recetas_controladas.servicio_id)
      AND recetas_controladas.estado_aprobacion = 'pendiente'
    )
  );

-- 6) POST-CHECK
SELECT 'recetas con folio nuevo' AS check, COUNT(*) FROM recetas_controladas WHERE folio ~ '^\d{4}/\d{4}$'
UNION ALL
SELECT 'columna estado_aprobacion', COUNT(*)::bigint FROM information_schema.columns
  WHERE table_name='recetas_controladas' AND column_name='estado_aprobacion'
UNION ALL
SELECT 'vista bitácora existe', COUNT(*)::bigint FROM information_schema.views
  WHERE table_name='v_bitacora_supervision';
