-- ============================================================
-- Migración 67: FIX zona horaria + turno en productividad
-- ============================================================
-- PROBLEMA (reporte del subjefe):
--   "La productividad no guarda bien, hay omisiones, y los ingresos
--    y egresos se van al turno Matutino o Nocturno (no al que toca)".
--
-- ZONA HORARIA: el hospital está en el PACÍFICO de México:
--   'America/Mazatlan' (UTC-7). Esa zona es la CORRECTA (NO es un artefacto).
--
-- CAUSA RAÍZ (el bug NO era la zona):
--   1) DOBLE CONVERSIÓN en fn_sumar_productividad (ingreso/egreso): tomaba
--      la hora LOCAL capturada, la reinterpretaba como UTC y la corría a
--      Mazatlan => -7h. Un ingreso de las 15:00 (Vespertino) se guardaba
--      como 08:00 (Matutino); uno de las 08:00 (Matutino) como 01:00
--      (Nocturno). De ahí "todo cae en Matutino o Nocturno".
--   2) DOS definiciones de turno distintas (fn_turno_por_hora vs
--      fn_turno_de_fecha) que no coincidían en las fronteras.
--
-- FRONTERAS OFICIALES (confirmadas con el subjefe, corte "por fin"):
--   M = 08:00–14:29   V = 14:30–20:29   N = 20:30–07:59 (cruza medianoche)
--
-- SOLUCIÓN: fn_turno_por_hora es la ÚNICA fuente de la verdad de las
--   fronteras; todo lo demás delega en ella. Toda conversión de zona usa
--   America/Mazatlan (Pacífico, UTC-7). Las horas YA capturadas como
--   locales NO se reconvierten (de ahí que se elimine la doble conversión).
--
-- Idempotente: CREATE OR REPLACE en todo. fn_turno_actual se reemplaza solo
--   en su cuerpo (sin DROP) para no romper la vista/policy que dependen de
--   ella. No borra datos.
-- NOTA: las capturas YA guardadas con turno equivocado NO se mueven solas.
--   Al final hay una consulta opcional para revisarlas.
-- ============================================================

-- ------------------------------------------------------------
-- 1) FUENTE ÚNICA: turno M/V/N a partir de una hora local.
--    M = 08:00–14:29, V = 14:30–20:29, N = resto.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_turno_por_hora(p_hora time without time zone)
RETURNS character
LANGUAGE plpgsql IMMUTABLE
AS $turnohora$
BEGIN
  IF p_hora IS NULL THEN
    RETURN 'M';
  END IF;
  IF    p_hora >= TIME '08:00:00' AND p_hora < TIME '14:30:00' THEN RETURN 'M';
  ELSIF p_hora >= TIME '14:30:00' AND p_hora < TIME '20:30:00' THEN RETURN 'V';
  ELSE  RETURN 'N';  -- 20:30:00–07:59:59 (cruza medianoche)
  END IF;
END;
$turnohora$;

COMMENT ON FUNCTION public.fn_turno_por_hora(time) IS
  'Fuente única de fronteras de turno. M=08:00-14:29, V=14:30-20:29, N=20:30-07:59.';

-- ------------------------------------------------------------
-- 2) Turno de un instante (timestamptz): lo lleva a hora local del
--    Pacífico y delega en fn_turno_por_hora. STABLE porque AT TIME ZONE
--    sobre timestamptz lo es.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_turno_de_fecha(_ts timestamptz)
RETURNS text
LANGUAGE sql STABLE
AS $turnofecha$
  SELECT public.fn_turno_por_hora( (_ts AT TIME ZONE 'America/Mazatlan')::time );
$turnofecha$;

COMMENT ON FUNCTION public.fn_turno_de_fecha(timestamptz) IS
  'Turno M/V/N de un instante, en hora local del Pacífico de México (UTC-7).';

-- ------------------------------------------------------------
-- 3) Turno actual = turno de AHORA en hora local correcta.
--    OJO: NO se puede DROP — dependen de ella la vista
--    v_asignaciones_actuales y la policy RLS p_auditoria_select_jefe_o_admin.
--    Tampoco se puede cambiar el tipo de retorno con CREATE OR REPLACE.
--    Solución: solo reemplazamos el CUERPO conservando el tipo de retorno
--    existente (sea character/varchar/text). Se detecta en caliente y se
--    aplica por SQL dinámico para que coincida exacto y no haya DROP.
-- ------------------------------------------------------------
DO $turnoactual_fix$
DECLARE
  _rettype text;
BEGIN
  SELECT pg_catalog.format_type(p.prorettype, NULL)
    INTO _rettype
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_turno_actual'
    AND p.pronargs = 0;

  _rettype := COALESCE(_rettype, 'text');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.fn_turno_actual() '
    'RETURNS %s LANGUAGE sql STABLE AS '
    '$body$ SELECT public.fn_turno_de_fecha(NOW())::%s; $body$',
    _rettype, _rettype
  );
END;
$turnoactual_fix$;

COMMENT ON FUNCTION public.fn_turno_actual() IS
  'Turno M/V/N actual en hora local del Pacífico de México (UTC-7).';

-- ------------------------------------------------------------
-- 4) Productividad por evento: fecha Y turno desde el MISMO instante
--    (fecha_realizacion), en hora local del Pacífico. Antes la fecha y el
--    turno salían de fuentes distintas (fn_turno_actual) -> incoherentes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_evento_productividad()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $evento$
DECLARE
  _codigos       TEXT[];
  _cod           TEXT;
  _indicador_id  INTEGER;
  _servicio_id   INTEGER;
  _ts            TIMESTAMPTZ;
  _local         TIMESTAMP;
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

  -- Servicio del paciente
  SELECT s.id INTO _servicio_id
  FROM pacientes p
  JOIN camas c          ON c.id = p.cama_id
  JOIN subservicios sub ON sub.id = c.subservicio_id
  JOIN servicios s      ON s.id = sub.servicio_id
  WHERE p.id = NEW.paciente_id;

  IF _servicio_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fecha y turno desde el MISMO instante, en hora local del Pacífico
  _ts    := COALESCE(NEW.fecha_realizacion, NOW());
  _local := _ts AT TIME ZONE 'America/Mazatlan';
  _anio  := EXTRACT(YEAR  FROM _local)::INTEGER;
  _mes   := EXTRACT(MONTH FROM _local)::INTEGER;
  _dia   := EXTRACT(DAY   FROM _local)::INTEGER;
  _turno := public.fn_turno_de_fecha(_ts);

  -- Todos los códigos de indicador que alimenta este evento
  _codigos := fn_codigos_prod_por_evento_paciente(NEW.paciente_id, NEW.tipo, NEW.codigo);

  FOREACH _cod IN ARRAY _codigos LOOP
    IF _cod IS NULL OR _cod = '' THEN
      CONTINUE;
    END IF;

    SELECT id INTO _indicador_id
    FROM catalogo_indicadores_productividad
    WHERE codigo = _cod
    LIMIT 1;

    IF _indicador_id IS NULL THEN
      CONTINUE;
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
$evento$;

-- ------------------------------------------------------------
-- 5) Ingreso HDL (P05/P06): turno desde la HORA capturada del ingreso
--    (fecha_ingreso/hora_ingreso ya son locales), no desde NOW().
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hdl_sync_ingreso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $hdl$
DECLARE
  _servicio_codigo TEXT;
  _codigo_indicador TEXT;
  _indicador_id INTEGER;
  _anio INT;
  _mes INT;
  _dia INT;
  _turno TEXT;
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
      -- fecha_ingreso / hora_ingreso YA son hora local: úsalas directo.
      _anio  := EXTRACT(YEAR  FROM NEW.fecha_ingreso)::INT;
      _mes   := EXTRACT(MONTH FROM NEW.fecha_ingreso)::INT;
      _dia   := EXTRACT(DAY   FROM NEW.fecha_ingreso)::INT;
      _turno := public.fn_turno_por_hora(COALESCE(NEW.hora_ingreso, '00:00'::time));
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
$hdl$;

-- ------------------------------------------------------------
-- 6) fn_sumar_productividad: la usan los disparadores de INGRESO (C02) y
--    EGRESO (C03-C06), aislamiento (K03) y traslados. Recibe fecha/hora
--    que YA son locales -> se elimina la doble conversión UTC->Mazatlan
--    (era el -7h que mandaba todo a Matutino/Nocturno). Turno por la
--    fuente única.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sumar_productividad(
  p_servicio_id integer,
  p_codigo_indicador text,
  p_fecha date,
  p_hora time without time zone,
  p_cantidad numeric DEFAULT 1,
  p_origen text DEFAULT 'AUTO_ING'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $sumar$
DECLARE
  v_indicador_id integer;
  v_turno char(1);
BEGIN
  IF p_servicio_id IS NULL OR p_fecha IS NULL OR p_hora IS NULL THEN
    RAISE NOTICE 'fn_sumar_productividad: parametros NULL';
    RETURN;
  END IF;

  SELECT id INTO v_indicador_id
  FROM catalogo_indicadores_productividad
  WHERE codigo = p_codigo_indicador AND activo = true
  LIMIT 1;

  IF v_indicador_id IS NULL THEN
    RAISE NOTICE 'fn_sumar_productividad: indicador % no encontrado', p_codigo_indicador;
    RETURN;
  END IF;

  -- p_fecha / p_hora YA son hora local del hospital: NO reconvertir zona.
  v_turno := public.fn_turno_por_hora(p_hora);

  INSERT INTO productividad_capturas (
    servicio_id, indicador_id, anio, mes, dia, turno,
    valor, origen, capturado_por, capturado_en, actualizado_en
  )
  VALUES (
    p_servicio_id,
    v_indicador_id,
    EXTRACT(YEAR  FROM p_fecha)::int,
    EXTRACT(MONTH FROM p_fecha)::int,
    EXTRACT(DAY   FROM p_fecha)::int,
    v_turno,
    p_cantidad,
    p_origen,
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (servicio_id, indicador_id, anio, mes, dia, turno)
  DO UPDATE SET
    valor = productividad_capturas.valor + p_cantidad,
    origen = CASE
      WHEN productividad_capturas.origen = 'MANUAL' THEN 'MANUAL'
      ELSE EXCLUDED.origen
    END,
    actualizado_en = NOW();
END;
$sumar$;

-- ------------------------------------------------------------
-- 7) Aislamiento (K03): NOW() en hora local del Pacífico (Mazatlan).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_aplicar_aislamiento(
  p_servicio_id integer, p_valor_anterior text, p_valor_nuevo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $aisla$
BEGIN
  -- NULL -> valor: +1
  IF (p_valor_anterior IS NULL OR TRIM(p_valor_anterior) = '')
     AND p_valor_nuevo IS NOT NULL
     AND TRIM(p_valor_nuevo) <> ''
  THEN
    PERFORM fn_sumar_productividad(
      p_servicio_id, 'K03',
      (NOW() AT TIME ZONE 'America/Mazatlan')::date,
      (NOW() AT TIME ZONE 'America/Mazatlan')::time,
      1, 'AUTO_ING');
  END IF;

  -- valor -> NULL: -1
  IF p_valor_anterior IS NOT NULL
     AND TRIM(p_valor_anterior) <> ''
     AND (p_valor_nuevo IS NULL OR TRIM(p_valor_nuevo) = '')
  THEN
    PERFORM fn_sumar_productividad(
      p_servicio_id, 'K03',
      (NOW() AT TIME ZONE 'America/Mazatlan')::date,
      (NOW() AT TIME ZONE 'America/Mazatlan')::time,
      -1, 'AUTO_ING');
  END IF;
END;
$aisla$;

-- ------------------------------------------------------------
-- 8) Continuidad por turno: hora local del Pacífico.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_continuidad_turno_actual()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $cont$
DECLARE
  _now    TIMESTAMP := NOW() AT TIME ZONE 'America/Mazatlan';
  _anio   INTEGER := EXTRACT(YEAR  FROM _now)::INTEGER;
  _mes    INTEGER := EXTRACT(MONTH FROM _now)::INTEGER;
  _dia    INTEGER := EXTRACT(DAY   FROM _now)::INTEGER;
  _turno  TEXT    := public.fn_turno_actual();
  _r      RECORD;
BEGIN
  FOR _r IN
    SELECT DISTINCT
      sub.servicio_id  AS servicio_id,
      ci.id            AS indicador_id,
      ci.codigo        AS codigo
    FROM evento_apoyo_paciente ev
    JOIN pacientes p ON p.id = ev.paciente_id
    JOIN camas c     ON c.id = p.cama_id
    JOIN subservicios sub ON sub.id = c.subservicio_id
    JOIN catalogo_indicadores_productividad ci
      ON ci.codigo = fn_codigo_productividad_por_tipo(ev.tipo, ev.codigo)
    WHERE ev.estado = 'Realizada'
      AND fn_es_tipo_continuidad(ev.tipo)
      AND p.estado = 'ACTIVO'
  LOOP
    PERFORM fn_recomputar_continuidad(
      _r.servicio_id, _r.indicador_id, _r.codigo,
      _anio, _mes, _dia, _turno
    );
  END LOOP;
END;
$cont$;

-- ============================================================
-- POST-CHECK (opcional): verificar turno actual y fronteras
-- ============================================================
SELECT
  NOW()                                      AS utc_ahora,
  (NOW() AT TIME ZONE 'America/Mazatlan') AS local_pacifico,
  fn_turno_actual()                          AS turno_actual;

-- Debe dar: 07:59->N, 08:00->M, 14:29->M, 14:30->V, 20:29->V, 20:30->N
SELECT t AS hora, fn_turno_por_hora(t) AS turno
FROM (VALUES
  ('07:59'::time),('08:00'),('14:29'),('14:30'),('20:29'),('20:30'),('23:00'),('03:00')
) v(t);

-- ============================================================
-- (OPCIONAL) Revisar capturas AUTO con turno posiblemente viejo/erróneo.
-- NO las corrige; solo las lista para decidir si se reprocesan.
-- ============================================================
-- SELECT servicio_id, indicador_id, anio, mes, dia, turno, valor, origen
-- FROM productividad_capturas
-- WHERE origen IN ('AUTO_ING','AUTO_EVENTO','AUTO_CONTINUIDAD')
-- ORDER BY anio DESC, mes DESC, dia DESC;
