-- ============================================================
-- Migración 31: Censo de Pacientes ERC (Hemodiálisis/DP)
-- ============================================================
-- Tabla independiente del censo principal. Vive como pestaña extra
-- dentro del servicio HEMODIALISIS. Cubre el censo institucional
-- de pacientes con Enfermedad Renal Crónica que reciben Terapia de
-- Sustitución Renal (Hemodiálisis, DPCA, DPA).
--
-- No reemplaza al censo de camillas: muchos pacientes ERC no están
-- físicamente hospitalizados, solo asisten a sus sesiones.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pacientes_erc (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          INTEGER,
  nombre_paciente TEXT NOT NULL,
  curp            TEXT,
  fecha_nacimiento DATE,
  terapia         TEXT CHECK (terapia IN ('Hemodiálisis','DPCA','DPA','DPI','HD','DP') OR terapia IS NULL),
  fecha_alta      DATE,
  estatus         TEXT,
  cama            TEXT,
  observaciones   TEXT,
  capturado_por   UUID REFERENCES perfiles(id),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_por UUID REFERENCES perfiles(id)
);

CREATE INDEX IF NOT EXISTS idx_pacientes_erc_curp ON public.pacientes_erc(curp);
CREATE INDEX IF NOT EXISTS idx_pacientes_erc_estatus ON public.pacientes_erc(estatus);

-- RLS: lectura para todos los autenticados; escritura para
-- admins globales y gestores de HEMODIALISIS.
ALTER TABLE public.pacientes_erc ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_erc_select ON public.pacientes_erc;
CREATE POLICY p_erc_select ON public.pacientes_erc
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS p_erc_insert ON public.pacientes_erc;
CREATE POLICY p_erc_insert ON public.pacientes_erc
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_es_admin_global()
    OR EXISTS (
      SELECT 1 FROM perfiles p
      JOIN servicios s ON s.id = p.servicio_id
      WHERE p.id = auth.uid() AND s.codigo = 'HDL'
    )
  );

DROP POLICY IF EXISTS p_erc_update ON public.pacientes_erc;
CREATE POLICY p_erc_update ON public.pacientes_erc
  FOR UPDATE TO authenticated
  USING (
    fn_es_admin_global()
    OR EXISTS (
      SELECT 1 FROM perfiles p
      JOIN servicios s ON s.id = p.servicio_id
      WHERE p.id = auth.uid() AND s.codigo = 'HDL'
    )
  );

DROP POLICY IF EXISTS p_erc_delete ON public.pacientes_erc;
CREATE POLICY p_erc_delete ON public.pacientes_erc
  FOR DELETE TO authenticated
  USING (fn_es_admin_global());

COMMENT ON TABLE public.pacientes_erc IS
  'Censo independiente de pacientes con Enfermedad Renal Crónica que reciben Terapia de Sustitución Renal. Pestaña dedicada en el servicio HEMODIALISIS.';
