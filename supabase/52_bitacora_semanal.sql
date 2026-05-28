-- ============================================================
-- Migración 52: Bitácora semanal + folio salida automático
-- ============================================================
-- 1. Folio salida (formato S-NNNN/YYYY) auto-asignado al canjear.
-- 2. Vista v_bitacora_psicotropicos_detalle: lista de vales canjeados
--    para llenar la sección "Detalle por paciente" del PDF.
-- 3. Vista v_bitacora_psicotropicos_semana: matriz 12 meds × 7 días ×
--    3 turnos × 4 columnas (surtido/recibido/utilizado/vales), por
--    rango de semana (lunes a domingo).
-- 4. Tabla snapshots_bitacora_dia para auto-archivado (futuras
--    auditorías) — un INSERT por día con JSON congelado.
-- ============================================================

-- 1) Columnas adicionales en recetas_controladas para folio salida
ALTER TABLE recetas_controladas
  ADD COLUMN IF NOT EXISTS num_folio_salida INTEGER,
  ADD COLUMN IF NOT EXISTS anio_folio_salida INTEGER;

CREATE INDEX IF NOT EXISTS idx_recetas_folio_salida
  ON recetas_controladas(anio_folio_salida, num_folio_salida);

-- 2) Trigger: asignar folio_salida al canjear
CREATE OR REPLACE FUNCTION fn_asignar_folio_salida()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  _anio INTEGER;
  _num  INTEGER;
BEGIN
  -- Solo cuando pasa a 'canjeada' y aún no tiene folio salida
  IF NEW.estado_aprobacion <> 'canjeada' THEN RETURN NEW; END IF;
  IF NEW.folio_salida IS NOT NULL AND NEW.folio_salida <> '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado_aprobacion = 'canjeada' THEN RETURN NEW; END IF;

  _anio := EXTRACT(YEAR FROM (COALESCE(NEW.canjeado_en, NOW()) AT TIME ZONE 'America/Mazatlan'));
  SELECT COALESCE(MAX(num_folio_salida), 0) + 1 INTO _num
    FROM recetas_controladas
   WHERE anio_folio_salida = _anio;

  NEW.anio_folio_salida := _anio;
  NEW.num_folio_salida  := _num;
  NEW.folio_salida      := 'S-' || LPAD(_num::TEXT, 4, '0') || '/' || _anio::TEXT;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_folio_salida ON recetas_controladas;
CREATE TRIGGER trg_folio_salida
  BEFORE UPDATE OF estado_aprobacion ON recetas_controladas
  FOR EACH ROW EXECUTE FUNCTION fn_asignar_folio_salida();

-- 3) Vista detalle de vales canjeados (alimenta la sección inferior del PDF)
CREATE OR REPLACE VIEW v_bitacora_psicotropicos_detalle AS
SELECT
  rc.id AS receta_id,
  rc.folio,
  rc.folio_salida,
  rc.creado_en,
  rc.canjeado_en,
  (COALESCE(rc.canjeado_en, rc.creado_en) AT TIME ZONE 'America/Mazatlan')::date AS fecha_dia,
  fn_turno_de_fecha(COALESCE(rc.canjeado_en, rc.creado_en)) AS turno,
  rc.paciente_cama,
  rc.paciente_nombre,
  rc.paciente_genero,
  rc.paciente_nss_curp AS no_expediente,
  rc.paciente_diagnostico,
  rc.paciente_subservicio,
  s.codigo AS servicio_codigo,
  s.nombre AS servicio_nombre,
  rc.medicamento_nombre,
  rc.cantidad_numero,
  rc.cantidad_letra,
  rc.medico_nombre,
  rc.medico_cedula,
  rc.enfermera_nombre AS enfermero_solicita,
  rc.aprobado_nombre AS supervisora,
  rc.observaciones,
  rc.estado_aprobacion
FROM recetas_controladas rc
LEFT JOIN servicios s ON s.id = rc.servicio_id
WHERE rc.estado_aprobacion IN ('aprobada','canjeada');

COMMENT ON VIEW v_bitacora_psicotropicos_detalle IS
  'Detalle de vales aprobados/canjeados para llenar el listado inferior de la hoja de control de psicotrópicos.';

-- 4) Vista semanal por medicamento × día × turno
--    Se filtra por rango de fechas en el frontend; aquí dejamos
--    todos los días y luego se filtra. Cada fila: 1 medicamento × 1 día.
CREATE OR REPLACE VIEW v_bitacora_psicotropicos_semana AS
SELECT
  inv.id AS inventario_id,
  inv.orden,
  inv.nombre,
  inv.presentacion,
  inv.unidad,
  inv.fondo_fijo,
  m.fecha,
  EXTRACT(DOW FROM m.fecha)::INTEGER AS dia_semana,  -- 0=domingo, 1=lunes...
  SUM(CASE WHEN m.turno='M' AND m.tipo='surtido'    THEN m.cantidad ELSE 0 END) AS m_surtido,
  SUM(CASE WHEN m.turno='M' AND m.tipo='recibido'   THEN m.cantidad ELSE 0 END) AS m_recibido,
  SUM(CASE WHEN m.turno='M' AND m.tipo='utilizado'  THEN m.cantidad ELSE 0 END) AS m_utilizado,
  SUM(CASE WHEN m.turno='M' AND m.tipo='vale'       THEN m.cantidad ELSE 0 END) AS m_vales,
  SUM(CASE WHEN m.turno='V' AND m.tipo='surtido'    THEN m.cantidad ELSE 0 END) AS v_surtido,
  SUM(CASE WHEN m.turno='V' AND m.tipo='recibido'   THEN m.cantidad ELSE 0 END) AS v_recibido,
  SUM(CASE WHEN m.turno='V' AND m.tipo='utilizado'  THEN m.cantidad ELSE 0 END) AS v_utilizado,
  SUM(CASE WHEN m.turno='V' AND m.tipo='vale'       THEN m.cantidad ELSE 0 END) AS v_vales,
  SUM(CASE WHEN m.turno='N' AND m.tipo='surtido'    THEN m.cantidad ELSE 0 END) AS n_surtido,
  SUM(CASE WHEN m.turno='N' AND m.tipo='recibido'   THEN m.cantidad ELSE 0 END) AS n_recibido,
  SUM(CASE WHEN m.turno='N' AND m.tipo='utilizado'  THEN m.cantidad ELSE 0 END) AS n_utilizado,
  SUM(CASE WHEN m.turno='N' AND m.tipo='vale'       THEN m.cantidad ELSE 0 END) AS n_vales
FROM inventario_psicotropicos inv
LEFT JOIN movimientos_psicotropicos m ON m.inventario_id = inv.id
WHERE inv.activo
GROUP BY inv.id, inv.orden, inv.nombre, inv.presentacion, inv.unidad, inv.fondo_fijo, m.fecha;

COMMENT ON VIEW v_bitacora_psicotropicos_semana IS
  'Movimientos agregados por medicamento × día × turno (Surtido/Recibido/Utilizado/Vales). Se filtra por rango de fechas desde el frontend.';

-- 5) Tabla de snapshots para archivo histórico inmutable
CREATE TABLE IF NOT EXISTS snapshots_bitacora_dia (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha         DATE NOT NULL UNIQUE,
  datos_json    JSONB NOT NULL,
  detalle_json  JSONB NOT NULL,
  folios_dia    INTEGER NOT NULL DEFAULT 0,
  vales_canjeados INTEGER NOT NULL DEFAULT 0,
  generado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generado_por  UUID REFERENCES perfiles(id),
  generado_nombre TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshots_fecha ON snapshots_bitacora_dia(fecha DESC);

COMMENT ON TABLE snapshots_bitacora_dia IS
  'Archivo histórico inmutable de la bitácora diaria de psicotrópicos. JSON congelado para auditorías futuras.';

-- 6) Función para generar snapshot de un día (idempotente: UPSERT)
CREATE OR REPLACE FUNCTION fn_generar_snapshot_bitacora(_fecha DATE)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  _id UUID;
  _datos JSONB;
  _detalle JSONB;
  _folios INTEGER;
  _canjeados INTEGER;
BEGIN
  -- Datos por medicamento del día
  SELECT jsonb_agg(row_to_json(s.*) ORDER BY s.orden)
  INTO _datos
  FROM (
    SELECT
      inv.id, inv.orden, inv.nombre, inv.presentacion, inv.unidad, inv.fondo_fijo,
      COALESCE(SUM(CASE WHEN m.turno='M' AND m.tipo='surtido'   THEN m.cantidad ELSE 0 END), 0) AS m_surtido,
      COALESCE(SUM(CASE WHEN m.turno='M' AND m.tipo='recibido'  THEN m.cantidad ELSE 0 END), 0) AS m_recibido,
      COALESCE(SUM(CASE WHEN m.turno='M' AND m.tipo='utilizado' THEN m.cantidad ELSE 0 END), 0) AS m_utilizado,
      COALESCE(SUM(CASE WHEN m.turno='M' AND m.tipo='vale'      THEN m.cantidad ELSE 0 END), 0) AS m_vales,
      COALESCE(SUM(CASE WHEN m.turno='V' AND m.tipo='surtido'   THEN m.cantidad ELSE 0 END), 0) AS v_surtido,
      COALESCE(SUM(CASE WHEN m.turno='V' AND m.tipo='recibido'  THEN m.cantidad ELSE 0 END), 0) AS v_recibido,
      COALESCE(SUM(CASE WHEN m.turno='V' AND m.tipo='utilizado' THEN m.cantidad ELSE 0 END), 0) AS v_utilizado,
      COALESCE(SUM(CASE WHEN m.turno='V' AND m.tipo='vale'      THEN m.cantidad ELSE 0 END), 0) AS v_vales,
      COALESCE(SUM(CASE WHEN m.turno='N' AND m.tipo='surtido'   THEN m.cantidad ELSE 0 END), 0) AS n_surtido,
      COALESCE(SUM(CASE WHEN m.turno='N' AND m.tipo='recibido'  THEN m.cantidad ELSE 0 END), 0) AS n_recibido,
      COALESCE(SUM(CASE WHEN m.turno='N' AND m.tipo='utilizado' THEN m.cantidad ELSE 0 END), 0) AS n_utilizado,
      COALESCE(SUM(CASE WHEN m.turno='N' AND m.tipo='vale'      THEN m.cantidad ELSE 0 END), 0) AS n_vales
    FROM inventario_psicotropicos inv
    LEFT JOIN movimientos_psicotropicos m ON m.inventario_id = inv.id AND m.fecha = _fecha
    WHERE inv.activo
    GROUP BY inv.id, inv.orden, inv.nombre, inv.presentacion, inv.unidad, inv.fondo_fijo
  ) s;

  -- Detalle de vales del día
  SELECT jsonb_agg(row_to_json(d.*) ORDER BY d.canjeado_en NULLS LAST, d.creado_en)
  INTO _detalle
  FROM (
    SELECT * FROM v_bitacora_psicotropicos_detalle WHERE fecha_dia = _fecha
  ) d;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE estado_aprobacion = 'canjeada')
  INTO _folios, _canjeados
  FROM v_bitacora_psicotropicos_detalle WHERE fecha_dia = _fecha;

  INSERT INTO snapshots_bitacora_dia (fecha, datos_json, detalle_json, folios_dia, vales_canjeados, generado_por, generado_nombre)
  VALUES (
    _fecha,
    COALESCE(_datos, '[]'::jsonb),
    COALESCE(_detalle, '[]'::jsonb),
    COALESCE(_folios, 0),
    COALESCE(_canjeados, 0),
    auth.uid(),
    (SELECT nombre_completo FROM perfiles WHERE id = auth.uid())
  )
  ON CONFLICT (fecha) DO UPDATE SET
    datos_json = EXCLUDED.datos_json,
    detalle_json = EXCLUDED.detalle_json,
    folios_dia = EXCLUDED.folios_dia,
    vales_canjeados = EXCLUDED.vales_canjeados,
    generado_en = NOW(),
    generado_por = EXCLUDED.generado_por,
    generado_nombre = EXCLUDED.generado_nombre
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

COMMENT ON FUNCTION fn_generar_snapshot_bitacora IS
  'Congela la bitácora de un día como snapshot inmutable JSON. Idempotente (UPSERT por fecha).';

-- 7) RLS snapshots
ALTER TABLE snapshots_bitacora_dia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_snap_select ON snapshots_bitacora_dia;
CREATE POLICY p_snap_select ON snapshots_bitacora_dia FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid()
            AND rol IN ('jefe','subjefe','supervisor') AND activo)
  );

DROP POLICY IF EXISTS p_snap_insert ON snapshots_bitacora_dia;
CREATE POLICY p_snap_insert ON snapshots_bitacora_dia FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid()
            AND rol IN ('jefe','subjefe','supervisor') AND activo)
  );

DROP POLICY IF EXISTS p_snap_update ON snapshots_bitacora_dia;
CREATE POLICY p_snap_update ON snapshots_bitacora_dia FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid()
            AND rol IN ('jefe','subjefe','supervisor') AND activo)
  );

-- 8) POST-CHECK
SELECT 'columnas folio salida' AS check,
       COUNT(*) FROM information_schema.columns
       WHERE table_name='recetas_controladas' AND column_name IN ('num_folio_salida','anio_folio_salida','folio_salida')
UNION ALL
SELECT 'vista detalle', (SELECT COUNT(*)::bigint FROM information_schema.views WHERE table_name='v_bitacora_psicotropicos_detalle')
UNION ALL
SELECT 'vista semana',  (SELECT COUNT(*)::bigint FROM information_schema.views WHERE table_name='v_bitacora_psicotropicos_semana')
UNION ALL
SELECT 'tabla snapshots', (SELECT COUNT(*)::bigint FROM information_schema.tables WHERE table_name='snapshots_bitacora_dia');
