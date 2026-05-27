-- ============================================================
-- Migración 32: Flujo de ingreso especial para HEMODIALISIS
-- ============================================================
-- Cambios para que un ingreso en el servicio HDL:
--  1) Reciba un tipo_terapia (Hemodiálisis | DPCA | DPA)
--  2) Sincronice automáticamente con pacientes_erc (bitácora)
--  3) Sume al indicador de productividad correcto
--     - Hemodiálisis → P06
--     - DPCA / DPA   → P05
-- ============================================================

-- 1) Columna tipo_terapia en pacientes (nullable, solo usada en HDL)
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS tipo_terapia TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pacientes_tipo_terapia') THEN
    ALTER TABLE public.pacientes
      ADD CONSTRAINT ck_pacientes_tipo_terapia
      CHECK (tipo_terapia IS NULL OR tipo_terapia IN ('Hemodiálisis','DPCA','DPA','DPI'));
  END IF;
END $$;

-- 2) Link de bitácora ERC al ingreso que la generó
ALTER TABLE public.pacientes_erc
  ADD COLUMN IF NOT EXISTS paciente_id UUID REFERENCES pacientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pacientes_erc_paciente_id ON public.pacientes_erc(paciente_id);

-- 3) Marcar P05 y P06 como AUTO_EVENTO (se auto-llenan desde ingreso HDL).
--    Antes eran MANUAL. P07 (PRISMA) se queda MANUAL por ahora.
UPDATE catalogo_indicadores_productividad
   SET origen = 'AUTO_EVENTO'
 WHERE codigo IN ('P05','P06');

-- 4) Trigger AFTER INSERT en pacientes que, si servicio=HDL y hay
--    tipo_terapia, sincroniza bitácora ERC y suma productividad.
CREATE OR REPLACE FUNCTION public.fn_hdl_sync_ingreso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _servicio_codigo TEXT;
  _codigo_indicador TEXT;
  _indicador_id INTEGER;
  _anio INT;
  _mes INT;
  _dia INT;
  _turno TEXT;
  _fecha_ingreso_local TIMESTAMPTZ;
BEGIN
  -- Solo si está activo
  IF NEW.estado <> 'ACTIVO' THEN RETURN NEW; END IF;

  -- Detectar servicio de la cama
  SELECT s.codigo INTO _servicio_codigo
  FROM camas c
  JOIN subservicios sub ON sub.id = c.subservicio_id
  JOIN servicios s     ON s.id = sub.servicio_id
  WHERE c.id = NEW.cama_id;

  -- Solo HDL aplica este flujo
  IF _servicio_codigo IS DISTINCT FROM 'HDL' THEN RETURN NEW; END IF;
  IF NEW.tipo_terapia IS NULL THEN RETURN NEW; END IF;

  -- Sincronizar bitácora ERC
  INSERT INTO public.pacientes_erc (
    paciente_id, nombre_paciente, curp, fecha_nacimiento,
    terapia, fecha_alta, estatus, cama,
    capturado_por
  )
  SELECT
    NEW.id,
    NEW.nombre_paciente,
    NEW.nss_curp,  -- el toggle CURP del modal guarda aquí
    NULL::date,    -- la fecha de nac viene en otro campo; el frontend la pasará
    NEW.tipo_terapia,
    NEW.fecha_ingreso,
    'ACTIVO',
    (SELECT c.numero_cama FROM camas c WHERE c.id = NEW.cama_id),
    NEW.capturado_por;

  -- Sumar a productividad: P06 para HD, P05 para DP*
  _codigo_indicador := CASE
    WHEN NEW.tipo_terapia = 'Hemodiálisis' THEN 'P06'
    WHEN NEW.tipo_terapia IN ('DPCA','DPA','DPI') THEN 'P05'
    ELSE NULL
  END;

  IF _codigo_indicador IS NOT NULL THEN
    SELECT id INTO _indicador_id
    FROM catalogo_indicadores_productividad
    WHERE codigo = _codigo_indicador
    LIMIT 1;

    IF _indicador_id IS NOT NULL THEN
      _fecha_ingreso_local := (NEW.fecha_ingreso + COALESCE(NEW.hora_ingreso, '00:00'::time))
                              AT TIME ZONE 'America/Mazatlan';
      _anio := EXTRACT(YEAR  FROM _fecha_ingreso_local)::INT;
      _mes  := EXTRACT(MONTH FROM _fecha_ingreso_local)::INT;
      _dia  := EXTRACT(DAY   FROM _fecha_ingreso_local)::INT;
      _turno := fn_turno_actual();

      INSERT INTO productividad_capturas
        (servicio_id, indicador_id, anio, mes, dia, turno, valor, origen)
      VALUES
        (12, _indicador_id, _anio, _mes, _dia, _turno, 1, 'AUTO_EVENTO')
      ON CONFLICT (servicio_id, indicador_id, anio, mes, dia, turno)
      DO UPDATE SET valor = productividad_capturas.valor + 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hdl_sync_ingreso ON public.pacientes;
CREATE TRIGGER trg_hdl_sync_ingreso
  AFTER INSERT ON public.pacientes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_hdl_sync_ingreso();

COMMENT ON FUNCTION public.fn_hdl_sync_ingreso IS
  'Cuando un paciente se ingresa al servicio HDL con tipo_terapia, sincroniza pacientes_erc (bitácora) y suma productividad (P06 HD / P05 DP).';

-- 5) Trigger para PROPAGAR fecha de nacimiento desde el formulario
--    a pacientes_erc. El frontend pasará fecha_nacimiento en una columna
--    extra: pacientes.fecha_nacimiento.
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;

-- Actualizar el trigger anterior para usar la fecha_nacimiento real
CREATE OR REPLACE FUNCTION public.fn_hdl_sync_ingreso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _servicio_codigo TEXT;
  _codigo_indicador TEXT;
  _indicador_id INTEGER;
  _anio INT;
  _mes INT;
  _dia INT;
  _turno TEXT;
  _fecha_ingreso_local TIMESTAMPTZ;
BEGIN
  IF NEW.estado <> 'ACTIVO' THEN RETURN NEW; END IF;

  SELECT s.codigo INTO _servicio_codigo
  FROM camas c
  JOIN subservicios sub ON sub.id = c.subservicio_id
  JOIN servicios s     ON s.id = sub.servicio_id
  WHERE c.id = NEW.cama_id;

  IF _servicio_codigo IS DISTINCT FROM 'HDL' THEN RETURN NEW; END IF;
  IF NEW.tipo_terapia IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.pacientes_erc (
    paciente_id, nombre_paciente, curp, fecha_nacimiento,
    terapia, fecha_alta, estatus, cama,
    capturado_por
  )
  VALUES (
    NEW.id, NEW.nombre_paciente, NEW.nss_curp, NEW.fecha_nacimiento,
    NEW.tipo_terapia, NEW.fecha_ingreso, 'ACTIVO',
    (SELECT c.numero_cama FROM camas c WHERE c.id = NEW.cama_id),
    NEW.capturado_por
  );

  _codigo_indicador := CASE
    WHEN NEW.tipo_terapia = 'Hemodiálisis' THEN 'P06'
    WHEN NEW.tipo_terapia IN ('DPCA','DPA','DPI') THEN 'P05'
    ELSE NULL
  END;

  IF _codigo_indicador IS NOT NULL THEN
    SELECT id INTO _indicador_id
    FROM catalogo_indicadores_productividad
    WHERE codigo = _codigo_indicador LIMIT 1;
    IF _indicador_id IS NOT NULL THEN
      _fecha_ingreso_local := (NEW.fecha_ingreso + COALESCE(NEW.hora_ingreso, '00:00'::time))
                              AT TIME ZONE 'America/Mazatlan';
      _anio := EXTRACT(YEAR  FROM _fecha_ingreso_local)::INT;
      _mes  := EXTRACT(MONTH FROM _fecha_ingreso_local)::INT;
      _dia  := EXTRACT(DAY   FROM _fecha_ingreso_local)::INT;
      _turno := fn_turno_actual();
      INSERT INTO productividad_capturas
        (servicio_id, indicador_id, anio, mes, dia, turno, valor, origen)
      VALUES
        (12, _indicador_id, _anio, _mes, _dia, _turno, 1, 'AUTO_EVENTO')
      ON CONFLICT (servicio_id, indicador_id, anio, mes, dia, turno)
      DO UPDATE SET valor = productividad_capturas.valor + 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- POST-CHECK
SELECT 'OK migración 32 aplicada' AS status,
       (SELECT COUNT(*) FROM catalogo_indicadores_productividad WHERE codigo IN ('P05','P06') AND origen='AUTO_EVENTO') AS p_auto,
       (SELECT column_name FROM information_schema.columns WHERE table_name='pacientes' AND column_name IN ('tipo_terapia','fecha_nacimiento') ORDER BY column_name) AS cols_nuevas;
