-- ============================================================
-- Migración 27: Productividad — automatización completa
-- ============================================================
-- Hasta ahora cada evento de Control generaba UNA captura en
-- productividad (la agregada AV1/SD1/etc o la específica V08/V12/etc).
-- Esta migración hace que un evento alimente TODOS los indicadores
-- relevantes a la vez: el agregado + el específico cuando aplica.
--
-- Cambios:
--   1) Nueva función fn_codigos_prod_por_evento_paciente devuelve un
--      ARRAY de códigos. Conserva contexto neonato/adulto del paciente.
--   2) fn_evento_productividad ahora itera sobre el array y hace
--      UPSERT en TODOS los indicadores correspondientes.
--   3) Catálogo: marca como AUTO_EVENTO los indicadores que ahora se
--      alimentan solos (eran MANUAL o AUTO_ING vacío).
--   4) Se mantiene compatibilidad: fn_codigo_prod_por_evento_paciente
--      sigue existiendo (devuelve el primero del array) por si algo
--      externo lo llama.
--
-- Mapeo final por tipo de evento:
--   acceso_vascular CVP + neonato → [AV1, V05]
--   acceso_vascular CVP + adulto  → [AV1, V09]
--   acceso_vascular CVC           → [AV1, V01]
--   acceso_vascular UMBILICAL     → [AV1, V25]
--   acceso_vascular LM            → [AV1, V13]   (nuevo subtipo "línea media")
--   curacion CUR_CVP + neonato    → [V08, CUR1]
--   curacion CUR_CVP + adulto     → [V12, CUR1]
--   curacion CUR_CVC              → [V03, CUR1]
--   curacion REF_CVP + neonato    → [V07, CUR1]
--   curacion REF_CVP + adulto     → [V11, CUR1]
--   curacion REF_CVC              → [V04, CUR1]
--   curacion CUR_LM               → [V15, CUR1]
--   curacion REF_LM               → [V16, CUR1]
--   curacion HERIDA               → [CUR1]
--   procedimiento *               → [PRC1, <codigo>]
--   sonda *                       → [SD1]
--   dispositivo *                 → [DP1]
--   oxigeno *                     → [OX1]
--   higiene *                     → [K06]
--   glucemia *                    → [K07]
-- ============================================================

-- 1) Función nueva que devuelve TODOS los códigos a alimentar
CREATE OR REPLACE FUNCTION public.fn_codigos_prod_por_evento_paciente(
  _paciente_id UUID,
  _tipo TEXT,
  _codigo TEXT
)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _es_neonato BOOLEAN := FALSE;
BEGIN
  -- Resolver neonato vs adulto (edad=0 o subservicio UCIN/Neona)
  IF _tipo IN ('curacion', 'acceso_vascular') THEN
    SELECT (p.edad = 0 OR sub.nombre ILIKE '%UCIN%' OR sub.nombre ILIKE '%NEONA%')
      INTO _es_neonato
    FROM pacientes p
    JOIN camas c          ON c.id = p.cama_id
    JOIN subservicios sub ON sub.id = c.subservicio_id
    WHERE p.id = _paciente_id;
  END IF;

  RETURN CASE _tipo
    WHEN 'acceso_vascular' THEN
      CASE _codigo
        WHEN 'CVP'       THEN CASE WHEN _es_neonato THEN ARRAY['AV1','V05'] ELSE ARRAY['AV1','V09'] END
        WHEN 'CVC'       THEN ARRAY['AV1','V01']
        WHEN 'UMBILICAL' THEN ARRAY['AV1','V25']
        WHEN 'LM'        THEN ARRAY['AV1','V13']
        ELSE ARRAY['AV1']
      END

    WHEN 'curacion' THEN
      CASE _codigo
        WHEN 'CUR_CVP' THEN CASE WHEN _es_neonato THEN ARRAY['V08','CUR1'] ELSE ARRAY['V12','CUR1'] END
        WHEN 'REF_CVP' THEN CASE WHEN _es_neonato THEN ARRAY['V07','CUR1'] ELSE ARRAY['V11','CUR1'] END
        WHEN 'CUR_CVC' THEN ARRAY['V03','CUR1']
        WHEN 'REF_CVC' THEN ARRAY['V04','CUR1']
        WHEN 'CUR_LM'  THEN ARRAY['V15','CUR1']
        WHEN 'REF_LM'  THEN ARRAY['V16','CUR1']
        ELSE ARRAY['CUR1']
      END

    WHEN 'procedimiento' THEN
      CASE
        WHEN _codigo IS NULL OR _codigo = '' THEN ARRAY['PRC1']
        ELSE ARRAY['PRC1', _codigo]
      END

    WHEN 'sonda'        THEN ARRAY['SD1']
    WHEN 'dispositivo'  THEN ARRAY['DP1']
    WHEN 'oxigeno'      THEN ARRAY['OX1']
    WHEN 'higiene'      THEN ARRAY['K06']
    WHEN 'glucemia'     THEN ARRAY['K07']
    -- Otros tipos: usar el codigo del evento tal cual (hemoderivado=V29,
    -- interconsulta, laboratorio, estudio_gabinete, precaucion_aislamiento=K03)
    ELSE ARRAY[_codigo]
  END;
END;
$$;

COMMENT ON FUNCTION public.fn_codigos_prod_por_evento_paciente IS
  'Devuelve TODOS los códigos de indicadores que un evento alimenta (agregado + específico). Considera neonato vs adulto.';

-- 2) Compat: la función singular delega a la primera del array
CREATE OR REPLACE FUNCTION public.fn_codigo_prod_por_evento_paciente(
  _paciente_id UUID,
  _tipo TEXT,
  _codigo TEXT
)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT (fn_codigos_prod_por_evento_paciente(_paciente_id, _tipo, _codigo))[1];
$$;

-- 3) Trigger principal: itera el array y hace UPSERT en cada indicador
CREATE OR REPLACE FUNCTION public.fn_evento_productividad()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  _codigos       TEXT[];
  _cod           TEXT;
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

  -- Obtener servicio del paciente
  SELECT s.id INTO _servicio_id
  FROM pacientes p
  JOIN camas c          ON c.id = p.cama_id
  JOIN subservicios sub ON sub.id = c.subservicio_id
  JOIN servicios s      ON s.id = sub.servicio_id
  WHERE p.id = NEW.paciente_id;

  IF _servicio_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calcular fecha y turno
  _fecha_real := COALESCE(NEW.fecha_realizacion, NOW()) AT TIME ZONE 'America/Mazatlan';
  _anio  := EXTRACT(YEAR  FROM _fecha_real)::INTEGER;
  _mes   := EXTRACT(MONTH FROM _fecha_real)::INTEGER;
  _dia   := EXTRACT(DAY   FROM _fecha_real)::INTEGER;
  _turno := fn_turno_actual();

  -- Obtener TODOS los códigos de indicadores que este evento alimenta
  _codigos := fn_codigos_prod_por_evento_paciente(NEW.paciente_id, NEW.tipo, NEW.codigo);

  -- Iterar e insertar en cada indicador
  FOREACH _cod IN ARRAY _codigos LOOP
    IF _cod IS NULL OR _cod = '' THEN
      CONTINUE;
    END IF;

    SELECT id INTO _indicador_id
    FROM catalogo_indicadores_productividad
    WHERE codigo = _cod
    LIMIT 1;

    IF _indicador_id IS NULL THEN
      CONTINUE;  -- indicador no existe en catálogo, lo saltamos
    END IF;

    INSERT INTO productividad_capturas
      (servicio_id, indicador_id, anio, mes, dia, turno, valor, origen)
    VALUES
      (_servicio_id, _indicador_id, _anio, _mes, _dia, _turno, 1, 'AUTO_EVENTO')
    ON CONFLICT (servicio_id, indicador_id, anio, mes, dia, turno)
    DO UPDATE SET valor = productividad_capturas.valor + 1;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 4) Catálogo: marcar como AUTO_EVENTO todos los indicadores que ahora
--    se alimentan solos. Los específicos de acceso vascular pasan de
--    AUTO_ING (que no estaba siendo respetado) a AUTO_EVENTO.
UPDATE catalogo_indicadores_productividad
   SET origen = 'AUTO_EVENTO'
 WHERE codigo IN (
   -- Agregados
   'AV1','SD1','DP1','OX1','K06','K07','CUR1','PRC1',
   -- Accesos vasculares específicos
   'V01','V05','V09','V13','V25',
   -- Curaciones (ya estaban en 26, idempotente)
   'V03','V04','V07','V08','V11','V12','V15','V16'
 );

-- 5) POST-CHECK
SELECT codigo, etiqueta, origen
  FROM catalogo_indicadores_productividad
 WHERE codigo IN (
   'AV1','SD1','DP1','OX1','K06','K07','CUR1','PRC1',
   'V01','V05','V09','V13','V25',
   'V03','V04','V07','V08','V11','V12','V15','V16'
 )
 ORDER BY codigo;
