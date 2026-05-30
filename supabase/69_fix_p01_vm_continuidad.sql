-- ============================================================
-- 69_fix_p01_vm_continuidad.sql
-- P01/P02/P03 (pacientes con ventilación mecánica) salían SIEMPRE
-- vacíos. Causa raíz:
--   1) En el catálogo P01-P04 están marcados origen='AUTO_TURNO',
--      pero AUTO_TURNO NO TIENE WRITER (nada lo siembra).
--   2) VM se captura como evento tipo='dispositivo', codigo='VM', y
--      AMBAS funciones de mapeo mandan dispositivo -> 'DP1'. Nunca a P0x.
--   3) El motor de continuidad usa fn_codigo_productividad_por_tipo()
--      (un solo código por evento) -> jamás produce P01/P02/P03.
--
-- FIX (mínimo, sin tocar la ruta AUTO_EVENTO):
--   - Nueva función fn_codigos_continuidad_por_evento_paciente() que,
--     SOLO para VM, devuelve [DP1, P01|P02|P03] según edad del paciente;
--     para todo lo demás devuelve el agregado de siempre (AV1/SD1/OX1/K03/DP1).
--   - fn_recomputar_continuidad y fn_continuidad_turno_actual pasan a
--     usar esa función (match por ANY(array) / unnest), así VM:
--       * sigue contando en DP1 (agregado de dispositivos), y
--       * además cae en P01/P02/P03 una vez por turno mientras la VM
--         esté activa (estado='Realizada', paciente ACTIVO).
--   - Catálogo: P01/P02/P03 pasan a origen='AUTO_CONTINUIDAD' para que
--     la UI no los espere como AUTO_TURNO (que está muerto).
--   - P04 (promedio de días de VM) es un cálculo distinto -> fuera de alcance.
--
-- Semántica: "se marca al registrar la fecha y se suma al siguiente
-- turno mientras tenga VM". El trigger trg_evento_continuidad_recompute
-- siembra el turno actual al instante; el cron (migración 68) lo arrastra
-- en cada frontera de turno.
--
-- CORTE DE EDAD (ajustable en la función de abajo):
--   edad = 0  o subservicio UCIN/NEONA  -> P03 (neonato)
--   edad 1–17                           -> P02 (pediátrico)
--   edad >= 18 (o NULL)                 -> P01 (adulto)
-- Idempotente: todo es CREATE OR REPLACE / UPDATE.
-- ============================================================

-- 1) Mapeo de continuidad por paciente (solo VM se separa por edad)
CREATE OR REPLACE FUNCTION public.fn_codigos_continuidad_por_evento_paciente(
  _paciente_id uuid,
  _tipo text,
  _codigo text
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  _vm TEXT;
BEGIN
  -- Solo Ventilación Mecánica (dispositivo + VM) se separa por edad.
  IF _tipo = 'dispositivo' AND _codigo = 'VM' THEN
    SELECT CASE
             WHEN p.edad = 0
               OR sub.nombre ILIKE '%UCIN%'
               OR sub.nombre ILIKE '%NEONA%'           THEN 'P03'  -- neonato
             WHEN p.edad BETWEEN 1 AND 17              THEN 'P02'  -- pediátrico
             ELSE                                           'P01'  -- adulto (incluye edad NULL)
           END
      INTO _vm
    FROM pacientes p
    JOIN camas c          ON c.id = p.cama_id
    JOIN subservicios sub ON sub.id = c.subservicio_id
    WHERE p.id = _paciente_id;

    RETURN ARRAY['DP1', COALESCE(_vm, 'P01')];
  END IF;

  -- Resto de tipos de continuidad: el agregado de siempre.
  RETURN ARRAY[ public.fn_codigo_productividad_por_tipo(_tipo, _codigo) ];
END;
$function$;

COMMENT ON FUNCTION public.fn_codigos_continuidad_por_evento_paciente IS
  'Mapeo evento->indicadores para el motor de CONTINUIDAD. VM se separa por edad en P01/P02/P03 y también suma a DP1; el resto usa el agregado de fn_codigo_productividad_por_tipo.';

-- 2) Recomputar continuidad: match por ANY(array) en vez del código singular
CREATE OR REPLACE FUNCTION public.fn_recomputar_continuidad(
  _servicio_id integer,
  _indicador_id integer,
  _codigo text,
  _anio integer,
  _mes integer,
  _dia integer,
  _turno text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  _count INTEGER;
BEGIN
  -- Contar pacientes activos en este servicio cuyo evento mapee
  -- al codigo del indicador (mapeo por-paciente: incluye VM -> P0x).
  SELECT COUNT(DISTINCT ev.id) INTO _count
  FROM evento_apoyo_paciente ev
  JOIN pacientes p ON p.id = ev.paciente_id
  JOIN camas c     ON c.id = p.cama_id
  JOIN subservicios sub ON sub.id = c.subservicio_id
  WHERE sub.servicio_id = _servicio_id
    AND _codigo = ANY(public.fn_codigos_continuidad_por_evento_paciente(ev.paciente_id, ev.tipo, ev.codigo))
    AND ev.estado = 'Realizada'
    AND fn_es_tipo_continuidad(ev.tipo)
    AND p.estado = 'ACTIVO';

  IF _count = 0 THEN
    -- No hay activos: no insertar ni borrar (preserva valores del trigger por evento)
    RETURN;
  END IF;

  INSERT INTO productividad_capturas
    (servicio_id, indicador_id, anio, mes, dia, turno, valor, origen)
  VALUES
    (_servicio_id, _indicador_id, _anio, _mes, _dia, _turno, _count, 'AUTO_CONTINUIDAD')
  ON CONFLICT (servicio_id, indicador_id, anio, mes, dia, turno)
  DO UPDATE SET
    valor  = GREATEST(productividad_capturas.valor, EXCLUDED.valor),
    origen = CASE
      WHEN productividad_capturas.origen = 'MANUAL' THEN 'MANUAL'  -- no sobreescribir capturas manuales
      ELSE 'AUTO_CONTINUIDAD'
    END;
END;
$function$;

-- 3) Job de turno actual: expandir el array por evento (unnest) y recomputar cada indicador
CREATE OR REPLACE FUNCTION public.fn_continuidad_turno_actual()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  _now TIMESTAMP := NOW() AT TIME ZONE 'America/Mazatlan';
  _anio INTEGER := EXTRACT(YEAR FROM _now)::INTEGER;
  _mes INTEGER := EXTRACT(MONTH FROM _now)::INTEGER;
  _dia INTEGER := EXTRACT(DAY FROM _now)::INTEGER;
  _turno TEXT := public.fn_turno_actual();
  _r RECORD;
BEGIN
  FOR _r IN
    SELECT DISTINCT sub.servicio_id AS servicio_id, ci.id AS indicador_id, ci.codigo AS codigo
    FROM evento_apoyo_paciente ev
    JOIN pacientes p ON p.id = ev.paciente_id
    JOIN camas c ON c.id = p.cama_id
    JOIN subservicios sub ON sub.id = c.subservicio_id
    JOIN LATERAL unnest(
           public.fn_codigos_continuidad_por_evento_paciente(ev.paciente_id, ev.tipo, ev.codigo)
         ) AS cod(codigo) ON TRUE
    JOIN catalogo_indicadores_productividad ci ON ci.codigo = cod.codigo
    WHERE ev.estado = 'Realizada' AND fn_es_tipo_continuidad(ev.tipo) AND p.estado = 'ACTIVO'
  LOOP
    PERFORM fn_recomputar_continuidad(_r.servicio_id, _r.indicador_id, _r.codigo, _anio, _mes, _dia, _turno);
  END LOOP;
END;
$function$;

-- 4) Catálogo: P01/P02/P03 se alimentan por continuidad (no AUTO_TURNO, que está muerto)
UPDATE catalogo_indicadores_productividad
   SET origen = 'AUTO_CONTINUIDAD'
 WHERE codigo IN ('P01','P02','P03');

-- 4b) P02 (pediátrico) y P03 (neonato) solo se MUESTRAN en Pediatría.
--     Es display: el cálculo no cambia (de todos modos solo dan valor donde hay
--     esos pacientes); oculta la fila fuera de PED, igual que V05/V07/V08/V25.
--     P01 (adulto) queda visible en todos los servicios.
--     La columna la crea la migración 66; aquí se asegura por si 66 aún no corre.
ALTER TABLE catalogo_indicadores_productividad
  ADD COLUMN IF NOT EXISTS solo_pediatria boolean NOT NULL DEFAULT false;

UPDATE catalogo_indicadores_productividad
   SET solo_pediatria = true
 WHERE codigo IN ('P02','P03');

-- 5) Sembrar YA el turno actual (pacientes con VM activa ahora mismo)
SELECT public.fn_continuidad_turno_actual();

-- 6) POST-CHECK: capturas
SELECT pc.servicio_id, ci.codigo, pc.anio, pc.mes, pc.dia, pc.turno, pc.valor, pc.origen
FROM productividad_capturas pc
JOIN catalogo_indicadores_productividad ci ON ci.id = pc.indicador_id
WHERE ci.codigo IN ('P01','P02','P03','DP1')
ORDER BY ci.codigo, pc.anio, pc.mes, pc.dia, pc.turno;

-- 7) POST-CHECK: catálogo VM (origen + solo_pediatria)
SELECT codigo, etiqueta, origen, solo_pediatria
FROM catalogo_indicadores_productividad
WHERE codigo IN ('P01','P02','P03','P04')
ORDER BY codigo;
