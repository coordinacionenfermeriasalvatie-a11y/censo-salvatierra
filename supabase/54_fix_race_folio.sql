-- ============================================================
-- Migración 54: Fix race condition en folio de recetas controladas
-- ============================================================
-- Problema:
--   Cuando dos gestores guardan una receta a la vez, ambas
--   transacciones leen MAX(num_folio) simultáneamente, calculan
--   el mismo siguiente número e intentan insertar. Una triunfa,
--   la otra falla con "duplicate key value violates unique
--   constraint recetas_controladas_folio_key".
--
-- Solución:
--   pg_advisory_xact_lock(_anio) serializa los INSERTs del mismo
--   año. La segunda transacción espera a que la primera termine
--   antes de leer MAX(num_folio).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_generar_folio_anual()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _anio INTEGER;
  _num  INTEGER;
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' OR NEW.anio_folio IS NULL THEN
    _anio := EXTRACT(YEAR FROM (COALESCE(NEW.creado_en, NOW()) AT TIME ZONE 'America/Mazatlan'));
    -- Advisory lock: serializa los INSERTs del mismo año durante esta transacción.
    -- Se libera automáticamente al COMMIT/ROLLBACK.
    PERFORM pg_advisory_xact_lock(_anio);
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

-- Igual para folio de salida (mismo riesgo de race condition)
CREATE OR REPLACE FUNCTION fn_asignar_folio_salida()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  _anio INTEGER;
  _num  INTEGER;
BEGIN
  IF NEW.estado_aprobacion <> 'canjeada' THEN RETURN NEW; END IF;
  IF NEW.folio_salida IS NOT NULL AND NEW.folio_salida <> '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado_aprobacion = 'canjeada' THEN RETURN NEW; END IF;

  _anio := EXTRACT(YEAR FROM (COALESCE(NEW.canjeado_en, NOW()) AT TIME ZONE 'America/Mazatlan'));
  -- Advisory lock distinto al de folio_entrada (sumar offset para que no
  -- choquen entre sí cuando un mismo año tiene ambos)
  PERFORM pg_advisory_xact_lock(_anio + 100000);
  SELECT COALESCE(MAX(num_folio_salida), 0) + 1 INTO _num
    FROM recetas_controladas
   WHERE anio_folio_salida = _anio;

  NEW.anio_folio_salida := _anio;
  NEW.num_folio_salida  := _num;
  NEW.folio_salida      := 'S-' || LPAD(_num::TEXT, 4, '0') || '/' || _anio::TEXT;

  RETURN NEW;
END;
$$;
