-- ============================================================
-- CONTINUIDAD DE CUIDADO -> PRODUCTIVIDAD (Fase A.3)
--
-- Items de continuidad (acceso_vascular, sonda, dispositivo,
-- precaucion_aislamiento) cuentan en productividad EN CADA TURNO
-- mientras esten activos (estado='Realizada' y no retirados).
--
-- Mecanica: funcion fn_recomputar_continuidad() que toma una
-- combinacion (servicio, indicador, dia, turno) y UPSERTea el
-- count de items activos. Se llama desde 2 puntos:
--   - Trigger en evento_apoyo_paciente cuando cambia estado de
--     un item de continuidad (instalacion o retiro).
--   - Job pg_cron al inicio de cada turno (08:01, 14:01, 20:01).
-- ============================================================

-- Tipos considerados como "continuidad de cuidado"
-- (cuentan en cada turno mientras esten Realizada y no Retirada)
CREATE OR REPLACE FUNCTION fn_es_tipo_continuidad(_tipo TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN _tipo IN (
    'acceso_vascular',
    'sonda',
    'dispositivo',
    'precaucion_aislamiento',
    'oxigeno'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recomputa el valor de productividad para una celda (s, ind, dia, turno):
-- cuenta items activos que mapean a ese indicador y los UPSERTea.
CREATE OR REPLACE FUNCTION fn_recomputar_continuidad(
  _servicio_id  INTEGER,
  _indicador_id INTEGER,
  _codigo       TEXT,
  _anio         INTEGER,
  _mes          INTEGER,
  _dia          INTEGER,
  _turno        TEXT
) RETURNS void AS $$
DECLARE
  _count INTEGER;
BEGIN
  -- Contar pacientes activos en este servicio cuyo evento mapee
  -- al codigo del indicador (usando el mapeo tipo->codigo).
  SELECT COUNT(DISTINCT ev.id) INTO _count
  FROM evento_apoyo_paciente ev
  JOIN pacientes p ON p.id = ev.paciente_id
  JOIN camas c     ON c.id = p.cama_id
  JOIN subservicios sub ON sub.id = c.subservicio_id
  WHERE sub.servicio_id = _servicio_id
    AND fn_codigo_productividad_por_tipo(ev.tipo, ev.codigo) = _codigo
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Job principal: recomputa todos los indicadores de continuidad
-- para el turno actual de hoy. Se llama desde pg_cron y desde triggers.
-- Usa fn_codigo_productividad_por_tipo() para mapear tipos "categoria"
-- (oxigeno -> OX1) al indicador fijo.
CREATE OR REPLACE FUNCTION fn_continuidad_turno_actual()
RETURNS void AS $$
DECLARE
  _now    TIMESTAMPTZ := NOW() AT TIME ZONE 'America/Mazatlan';
  _anio   INTEGER := EXTRACT(YEAR  FROM _now)::INTEGER;
  _mes    INTEGER := EXTRACT(MONTH FROM _now)::INTEGER;
  _dia    INTEGER := EXTRACT(DAY   FROM _now)::INTEGER;
  _turno  TEXT    := fn_turno_actual();
  _r      RECORD;
BEGIN
  -- Iterar por cada combinacion (servicio, indicador) con eventos activos
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_continuidad_turno_actual IS
  'Recomputa productividad de continuidad para el turno actual (M/V/N de hoy). Llamado desde pg_cron al inicio de cada turno y desde triggers de evento_apoyo_paciente.';

-- Trigger: cuando cambia el estado de un item de continuidad,
-- recompute el turno actual (en caso de instalacion/retiro mid-turno)
CREATE OR REPLACE FUNCTION fn_evento_continuidad_recompute()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo nos importa si es tipo de continuidad y cambio el estado
  IF NOT fn_es_tipo_continuidad(NEW.tipo) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;
  -- Reusar el job para recomputar el turno actual completo
  PERFORM fn_continuidad_turno_actual();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_evento_continuidad_recompute ON evento_apoyo_paciente;
CREATE TRIGGER trg_evento_continuidad_recompute
AFTER INSERT OR UPDATE OF estado ON evento_apoyo_paciente
FOR EACH ROW EXECUTE FUNCTION fn_evento_continuidad_recompute();

-- ============================================================
-- pg_cron: scheduling al inicio de cada turno (archivo 06b)
-- ============================================================
-- El scheduling se movio a 06b_cron_continuidad.sql porque
-- requiere la extension pg_cron habilitada en Supabase Dashboard.
--
-- Sin cron este archivo funciona, pero solo se recomputara la
-- continuidad cuando un evento cambie de estado (vía trigger),
-- no automaticamente al inicio del turno.
--
-- Para habilitar cron:
--   1. Supabase Dashboard > Database > Extensions > activar pg_cron
--   2. Aplicar el archivo 06b_cron_continuidad.sql
-- ============================================================
