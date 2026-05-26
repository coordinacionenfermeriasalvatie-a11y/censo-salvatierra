-- ============================================================
-- Migración 26: Auto-llenar productividad desde eventos de curación
-- ============================================================
-- Antes de esto, los eventos de tipo `curacion` (CUR_CVP, CUR_CVC,
-- REF_CVC, HERIDA) se registraban en formato_control pero NO sumaban
-- en productividad porque fn_codigo_productividad_por_tipo devolvía
-- el código del evento tal cual y no había entradas con esos códigos
-- en catalogo_indicadores_productividad.
--
-- Esta migración:
--   1) Agrega nueva función fn_codigo_prod_por_evento_paciente(paciente_id,
--      tipo, codigo) que tiene acceso a la edad del paciente para
--      distinguir neonato (edad = 0) vs adulto.
--   2) Mapea los códigos de evento al código de indicador correcto:
--        - CUR_CVP + neonato  → V08 (CVP NEONATOS - Curacion de sitio)
--        - CUR_CVP + adulto   → V12 (CVP ADULTO   - Curacion de sitio)
--        - CUR_CVC            → V03 (CVC          - Curacion de sitio)
--        - REF_CVP + neonato  → V07 (CVP NEONATOS - Refijacion)
--        - REF_CVP + adulto   → V11 (CVP ADULTO   - Refijacion)
--        - REF_CVC            → V04 (CVC          - Refijacion)
--        - CUR_LM             → V15 (LINEA MEDIA  - Curacion de sitio)
--        - REF_LM             → V16 (LINEA MEDIA  - Refijacion)
--   3) Actualiza el trigger fn_evento_productividad para llamar a la
--      nueva función cuando tipo='curacion'.
--   4) Marca como AUTO_EVENTO los indicadores V03, V04, V07, V08, V11,
--      V12, V15, V16 (antes MANUAL) para que la UI los pinte como
--      celdas auto-llenadas no editables.
-- ============================================================

-- 1) Nueva función con contexto del paciente (edad → neonato/adulto)
CREATE OR REPLACE FUNCTION public.fn_codigo_prod_por_evento_paciente(
  _paciente_id UUID,
  _tipo TEXT,
  _codigo TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _es_neonato BOOLEAN;
BEGIN
  -- Si no es curacion ni acceso_vascular específicos, delega al mapper
  -- original (oxígeno/higiene/glucemia/etc).
  IF _tipo <> 'curacion' THEN
    RETURN fn_codigo_productividad_por_tipo(_tipo, _codigo);
  END IF;

  -- Es curacion: cargar edad para distinguir neonato/adulto.
  -- Convención: edad = 0 (años) → NEONATO. Resto → ADULTO.
  -- Si el subservicio es UCIN/Neonatología, forzamos neonato aunque
  -- la edad no sea 0 (raro pero posible).
  SELECT (p.edad = 0 OR sub.nombre ILIKE '%UCIN%' OR sub.nombre ILIKE '%NEONA%')
    INTO _es_neonato
  FROM pacientes p
  JOIN camas c          ON c.id = p.cama_id
  JOIN subservicios sub ON sub.id = c.subservicio_id
  WHERE p.id = _paciente_id;

  RETURN CASE _codigo
    -- CVP (depende de neonato vs adulto)
    WHEN 'CUR_CVP' THEN CASE WHEN _es_neonato THEN 'V08' ELSE 'V12' END
    WHEN 'REF_CVP' THEN CASE WHEN _es_neonato THEN 'V07' ELSE 'V11' END
    -- CVC (mismo código sin distinción)
    WHEN 'CUR_CVC' THEN 'V03'
    WHEN 'REF_CVC' THEN 'V04'
    -- Línea media (mismo código sin distinción)
    WHEN 'CUR_LM'  THEN 'V15'
    WHEN 'REF_LM'  THEN 'V16'
    -- HERIDA u otros: deja pasar el código original (no auto-mapea)
    ELSE _codigo
  END;
END;
$$;

COMMENT ON FUNCTION public.fn_codigo_prod_por_evento_paciente IS
  'Mapea código de evento a código de indicador de productividad considerando si el paciente es neonato (edad=0 o UCIN). Reemplaza el mapper estático para tipo=curacion.';

-- 2) Actualizar el trigger principal para usar la nueva función
CREATE OR REPLACE FUNCTION public.fn_evento_productividad()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  _codigo_prod   TEXT;
  _indicador_id  INTEGER;
  _servicio_id   INTEGER;
  _fecha_real    TIMESTAMPTZ;
  _anio          INTEGER;
  _mes           INTEGER;
  _dia           INTEGER;
  _turno         TEXT;
BEGIN
  -- Salimos si no es transicion a Realizada
  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado = 'Realizada' OR NEW.estado <> 'Realizada' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'Realizada' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Mapear (ahora con contexto de paciente para neonato/adulto en curacion)
  _codigo_prod := fn_codigo_prod_por_evento_paciente(NEW.paciente_id, NEW.tipo, NEW.codigo);

  -- Buscar indicador por codigo (si no existe, salir silenciosamente)
  SELECT id INTO _indicador_id
  FROM catalogo_indicadores_productividad
  WHERE codigo = _codigo_prod
  LIMIT 1;

  IF _indicador_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener servicio del paciente (via cama -> subservicio -> servicio)
  SELECT s.id INTO _servicio_id
  FROM pacientes p
  JOIN camas c ON c.id = p.cama_id
  JOIN subservicios sub ON sub.id = c.subservicio_id
  JOIN servicios s ON s.id = sub.servicio_id
  WHERE p.id = NEW.paciente_id;

  IF _servicio_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calcular anio/mes/dia/turno desde fecha_realizacion (zona local Mazatlan)
  _fecha_real := COALESCE(NEW.fecha_realizacion, NOW()) AT TIME ZONE 'America/Mazatlan';
  _anio  := EXTRACT(YEAR  FROM _fecha_real)::INTEGER;
  _mes   := EXTRACT(MONTH FROM _fecha_real)::INTEGER;
  _dia   := EXTRACT(DAY   FROM _fecha_real)::INTEGER;
  _turno := fn_turno_actual();  -- M / V / N segun la hora actual

  -- Upsert: si ya existe la celda (servicio,indicador,fecha,turno), +1
  INSERT INTO productividad_capturas
    (servicio_id, indicador_id, anio, mes, dia, turno, valor, origen)
  VALUES
    (_servicio_id, _indicador_id, _anio, _mes, _dia, _turno, 1, 'AUTO_EVENTO')
  ON CONFLICT (servicio_id, indicador_id, anio, mes, dia, turno)
  DO UPDATE SET valor = productividad_capturas.valor + 1;

  RETURN NEW;
END;
$function$;

-- 3) Ampliar el CHECK de origen para aceptar AUTO_EVENTO y AUTO_CONTINUIDAD
--    (la UI ya los conoce, pero el constraint del catálogo aún no).
ALTER TABLE catalogo_indicadores_productividad
  DROP CONSTRAINT IF EXISTS catalogo_indicadores_productividad_origen_check;
ALTER TABLE catalogo_indicadores_productividad
  ADD  CONSTRAINT catalogo_indicadores_productividad_origen_check
  CHECK (origen IN ('AUTO_ING','AUTO_TURNO','AUTO_EVENTO','AUTO_CONTINUIDAD','MANUAL'));

-- 4) Marcar los indicadores afectados como AUTO_EVENTO (eran MANUAL).
--    Esto hace que la UI pinte la celda en color lavanda y la bloquee
--    como no editable manualmente — el valor lo genera el evento.
UPDATE catalogo_indicadores_productividad
   SET origen = 'AUTO_EVENTO'
 WHERE codigo IN ('V03','V04','V07','V08','V11','V12','V15','V16');

-- 5) POST-CHECK: estructura final
SELECT codigo, etiqueta, origen
  FROM catalogo_indicadores_productividad
 WHERE codigo IN ('V03','V04','V07','V08','V11','V12','V15','V16')
 ORDER BY codigo;
