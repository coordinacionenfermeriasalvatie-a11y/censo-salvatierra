-- ============================================================
-- EVENTOS DE APOYO / ESTUDIO POR PACIENTE  (Fase A.1)
-- Log inmutable de cada evento (interconsulta, hemoderivado,
-- laboratorio, estudio gabinete, sonda, dispositivo,
-- procedimiento, curacion, acceso vascular) con su estado y
-- fechas. Cada cambio o re-solicitud = nueva fila (no se sobrescribe).
--
-- Idempotente. No toca la UI todavia.
-- ============================================================

-- 1) Tabla
CREATE TABLE IF NOT EXISTS evento_apoyo_paciente (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id       UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  tipo              TEXT NOT NULL CHECK (tipo IN (
                      'interconsulta',
                      'hemoderivado',
                      'laboratorio',
                      'estudio_gabinete',
                      'sonda',
                      'dispositivo',
                      'procedimiento',
                      'curacion',
                      'acceso_vascular',
                      'oxigeno',
                      'higiene',
                      'glucemia',
                      'precaucion_aislamiento'
                    )),
  codigo            TEXT NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'Solicitada' CHECK (estado IN (
                      'Solicitada', 'Pendiente', 'Realizada', 'Retirada', 'Cancelada'
                    )),
  fecha_solicitud   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_realizacion TIMESTAMPTZ NULL,
  fecha_retiro      TIMESTAMPTZ NULL,
  observaciones     TEXT NULL,
  capturado_por     UUID NOT NULL REFERENCES auth.users(id),
  capturado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_por   UUID NULL REFERENCES auth.users(id),
  actualizado_en    TIMESTAMPTZ NULL,
  -- Coherencia de fechas con estado:
  CONSTRAINT chk_fecha_realizacion_consistente CHECK (
    (estado IN ('Realizada','Retirada') AND fecha_realizacion IS NOT NULL)
    OR estado NOT IN ('Realizada','Retirada')
  ),
  CONSTRAINT chk_fecha_retiro_consistente CHECK (
    (estado = 'Retirada' AND fecha_retiro IS NOT NULL)
    OR (estado <> 'Retirada' AND fecha_retiro IS NULL)
  )
);

-- 2) Indices para consulta rapida
CREATE INDEX IF NOT EXISTS idx_evento_apoyo_paciente
  ON evento_apoyo_paciente (paciente_id);

CREATE INDEX IF NOT EXISTS idx_evento_apoyo_paciente_tipo
  ON evento_apoyo_paciente (paciente_id, tipo);

CREATE INDEX IF NOT EXISTS idx_evento_apoyo_estado
  ON evento_apoyo_paciente (estado);

CREATE INDEX IF NOT EXISTS idx_evento_apoyo_realizada
  ON evento_apoyo_paciente (fecha_realizacion DESC)
  WHERE estado = 'Realizada';

CREATE INDEX IF NOT EXISTS idx_evento_apoyo_solicitud
  ON evento_apoyo_paciente (fecha_solicitud DESC);

-- Indice para job de continuidad: items activos (Realizada, sin retirar)
CREATE INDEX IF NOT EXISTS idx_evento_apoyo_activos
  ON evento_apoyo_paciente (paciente_id, tipo)
  WHERE estado = 'Realizada';

-- 3) Auditoria automatica (mismo patron que el resto del sistema)
CREATE TRIGGER trg_auditar_evento_apoyo
AFTER INSERT OR UPDATE ON evento_apoyo_paciente
FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio();

-- 4) Row Level Security
ALTER TABLE evento_apoyo_paciente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lectura_eventos_apoyo ON evento_apoyo_paciente;
CREATE POLICY lectura_eventos_apoyo ON evento_apoyo_paciente
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS insercion_eventos_apoyo ON evento_apoyo_paciente;
CREATE POLICY insercion_eventos_apoyo ON evento_apoyo_paciente
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = capturado_por);

DROP POLICY IF EXISTS actualizacion_eventos_apoyo ON evento_apoyo_paciente;
CREATE POLICY actualizacion_eventos_apoyo ON evento_apoyo_paciente
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Sin politica DELETE: log inmutable.

COMMENT ON TABLE evento_apoyo_paciente IS
  'Log de eventos clinicos por paciente (interconsultas, hemoderivados, estudios, sondas, dispositivos, procedimientos, curaciones, accesos vasculares). Cada cambio de estado o re-solicitud genera un nuevo evento. Inmutable: no DELETE.';
