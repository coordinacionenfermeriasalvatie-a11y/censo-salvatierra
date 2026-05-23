-- ============================================================
-- TEST: Validacion Fase A
--   evento_apoyo_paciente -> productividad_capturas
--
-- Ejecutar en Supabase SQL Editor.
--   * Todo va en BEGIN/ROLLBACK: NADA queda persistido.
--   * Auto-selecciona el primer paciente ACTIVO + primer auth.users.
--   * Imprime una tabla _test_resultados con ok=true/false por caso.
--
-- CASOS
--   A. tipo categoria 'higiene'  INSERT estado=Realizada  -> K06 +1
--   B. tipo categoria 'glucemia' INSERT estado=Realizada  -> K07 +1
--   C. tipo continuidad 'oxigeno' INSERT Solicitada, UPDATE->Realizada
--                                   -> OX1 +1 (trigger evento)
--                                   + recompute continuidad (sin sumar)
--   D. tipo 'interconsulta' codigo INEXISTENTE
--                                   -> 0 cambios (degradacion silenciosa, sin error)
--
-- Para PASAR, todos los renglones de _test_resultados deben tener ok=true.
-- ============================================================

BEGIN;

CREATE TEMP TABLE _test_resultados (
  caso              TEXT,
  descripcion       TEXT,
  codigo            TEXT,
  valor_antes       INTEGER,
  valor_despues     INTEGER,
  delta             INTEGER,
  delta_esperado    INTEGER,
  ok                BOOLEAN
) ON COMMIT DROP;

DO $$
DECLARE
  v_paciente_id  UUID;
  v_user_id      UUID;
  v_servicio_id  INTEGER;
  v_anio         INTEGER;
  v_mes          INTEGER;
  v_dia          INTEGER;
  v_turno        TEXT;
  v_evento_id    UUID;
  v_antes        INTEGER;
  v_despues      INTEGER;
  v_indicador_id INTEGER;
BEGIN
  -- ---- Setup: auto-pick paciente + user + servicio ----
  SELECT id INTO v_paciente_id
  FROM pacientes
  WHERE estado = 'ACTIVO'
  ORDER BY capturado_en DESC
  LIMIT 1;

  IF v_paciente_id IS NULL THEN
    RAISE EXCEPTION 'No hay pacientes con estado=ACTIVO. Crea uno en la app antes de correr el test.';
  END IF;

  SELECT id INTO v_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No hay usuarios en auth.users.';
  END IF;

  SELECT s.id INTO v_servicio_id
  FROM pacientes p
  JOIN camas c          ON c.id   = p.cama_id
  JOIN subservicios sub ON sub.id = c.subservicio_id
  JOIN servicios s      ON s.id   = sub.servicio_id
  WHERE p.id = v_paciente_id;

  IF v_servicio_id IS NULL THEN
    RAISE EXCEPTION 'El paciente % no tiene cama->subservicio->servicio resolvible.', v_paciente_id;
  END IF;

  SELECT
    EXTRACT(YEAR  FROM (NOW() AT TIME ZONE 'America/Mazatlan'))::INTEGER,
    EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'America/Mazatlan'))::INTEGER,
    EXTRACT(DAY   FROM (NOW() AT TIME ZONE 'America/Mazatlan'))::INTEGER
  INTO v_anio, v_mes, v_dia;

  v_turno := fn_turno_actual();

  RAISE NOTICE '--- TEST FASE A ---';
  RAISE NOTICE 'paciente=%  user=%  servicio=%  fecha=%-%-%  turno=%',
    v_paciente_id, v_user_id, v_servicio_id, v_anio, v_mes, v_dia, v_turno;

  ------------------------------------------------------------
  -- CASO A: higiene -> K06
  ------------------------------------------------------------
  SELECT id INTO v_indicador_id
  FROM catalogo_indicadores_productividad WHERE codigo = 'K06';

  IF v_indicador_id IS NULL THEN
    INSERT INTO _test_resultados VALUES
      ('A', 'tipo=higiene Realizada', 'K06', NULL, NULL, NULL, 1, false);
  ELSE
    SELECT COALESCE(SUM(valor), 0) INTO v_antes
    FROM productividad_capturas
    WHERE servicio_id = v_servicio_id AND indicador_id = v_indicador_id
      AND anio = v_anio AND mes = v_mes AND dia = v_dia AND turno = v_turno;

    INSERT INTO evento_apoyo_paciente
      (paciente_id, tipo, codigo, estado, fecha_realizacion, capturado_por)
    VALUES
      (v_paciente_id, 'higiene', 'HIGIENE', 'Realizada', NOW(), v_user_id);

    SELECT COALESCE(SUM(valor), 0) INTO v_despues
    FROM productividad_capturas
    WHERE servicio_id = v_servicio_id AND indicador_id = v_indicador_id
      AND anio = v_anio AND mes = v_mes AND dia = v_dia AND turno = v_turno;

    INSERT INTO _test_resultados VALUES
      ('A', 'INSERT estado=Realizada tipo=higiene', 'K06',
       v_antes, v_despues, v_despues - v_antes, 1, (v_despues - v_antes) = 1);
  END IF;

  ------------------------------------------------------------
  -- CASO B: glucemia -> K07
  ------------------------------------------------------------
  SELECT id INTO v_indicador_id
  FROM catalogo_indicadores_productividad WHERE codigo = 'K07';

  IF v_indicador_id IS NULL THEN
    INSERT INTO _test_resultados VALUES
      ('B', 'tipo=glucemia Realizada', 'K07', NULL, NULL, NULL, 1, false);
  ELSE
    SELECT COALESCE(SUM(valor), 0) INTO v_antes
    FROM productividad_capturas
    WHERE servicio_id = v_servicio_id AND indicador_id = v_indicador_id
      AND anio = v_anio AND mes = v_mes AND dia = v_dia AND turno = v_turno;

    INSERT INTO evento_apoyo_paciente
      (paciente_id, tipo, codigo, estado, fecha_realizacion, capturado_por)
    VALUES
      (v_paciente_id, 'glucemia', 'GLUCEMIA', 'Realizada', NOW(), v_user_id);

    SELECT COALESCE(SUM(valor), 0) INTO v_despues
    FROM productividad_capturas
    WHERE servicio_id = v_servicio_id AND indicador_id = v_indicador_id
      AND anio = v_anio AND mes = v_mes AND dia = v_dia AND turno = v_turno;

    INSERT INTO _test_resultados VALUES
      ('B', 'INSERT estado=Realizada tipo=glucemia', 'K07',
       v_antes, v_despues, v_despues - v_antes, 1, (v_despues - v_antes) = 1);
  END IF;

  ------------------------------------------------------------
  -- CASO C: oxigeno (continuidad) - INSERT Solicitada, UPDATE -> Realizada
  -- Esperado:
  --   * Tras INSERT Solicitada: delta 0 (trigger no dispara).
  --   * Tras UPDATE a Realizada:
  --       - trigger evento +1
  --       - trigger continuidad recompute (GREATEST, no resta)
  --     Delta neto >= 1 (al menos 1; mas si habia mas activos previos).
  ------------------------------------------------------------
  SELECT id INTO v_indicador_id
  FROM catalogo_indicadores_productividad WHERE codigo = 'OX1';

  IF v_indicador_id IS NULL THEN
    INSERT INTO _test_resultados VALUES
      ('C', 'tipo=oxigeno UPDATE->Realizada', 'OX1', NULL, NULL, NULL, 1, false);
  ELSE
    SELECT COALESCE(SUM(valor), 0) INTO v_antes
    FROM productividad_capturas
    WHERE servicio_id = v_servicio_id AND indicador_id = v_indicador_id
      AND anio = v_anio AND mes = v_mes AND dia = v_dia AND turno = v_turno;

    INSERT INTO evento_apoyo_paciente
      (paciente_id, tipo, codigo, estado, capturado_por)
    VALUES
      (v_paciente_id, 'oxigeno', 'PUNTAS', 'Solicitada', v_user_id)
    RETURNING id INTO v_evento_id;

    -- Tras INSERT Solicitada no debe haber cambio
    SELECT COALESCE(SUM(valor), 0) INTO v_despues
    FROM productividad_capturas
    WHERE servicio_id = v_servicio_id AND indicador_id = v_indicador_id
      AND anio = v_anio AND mes = v_mes AND dia = v_dia AND turno = v_turno;

    INSERT INTO _test_resultados VALUES
      ('C.1', 'INSERT estado=Solicitada (no debe contar)', 'OX1',
       v_antes, v_despues, v_despues - v_antes, 0, v_despues = v_antes);

    -- UPDATE a Realizada
    UPDATE evento_apoyo_paciente
    SET estado = 'Realizada', fecha_realizacion = NOW()
    WHERE id = v_evento_id;

    SELECT COALESCE(SUM(valor), 0) INTO v_despues
    FROM productividad_capturas
    WHERE servicio_id = v_servicio_id AND indicador_id = v_indicador_id
      AND anio = v_anio AND mes = v_mes AND dia = v_dia AND turno = v_turno;

    INSERT INTO _test_resultados VALUES
      ('C.2', 'UPDATE Solicitada->Realizada tipo=oxigeno', 'OX1',
       v_antes, v_despues, v_despues - v_antes, 1, (v_despues - v_antes) >= 1);
  END IF;

  ------------------------------------------------------------
  -- CASO D: codigo inexistente - degradacion silenciosa
  ------------------------------------------------------------
  BEGIN
    SELECT COALESCE(SUM(valor), 0) INTO v_antes
    FROM productividad_capturas
    WHERE servicio_id = v_servicio_id
      AND anio = v_anio AND mes = v_mes AND dia = v_dia AND turno = v_turno;

    INSERT INTO evento_apoyo_paciente
      (paciente_id, tipo, codigo, estado, fecha_realizacion, capturado_por)
    VALUES
      (v_paciente_id, 'interconsulta', 'ZZZ-INEXISTENTE-TEST', 'Realizada', NOW(), v_user_id);

    SELECT COALESCE(SUM(valor), 0) INTO v_despues
    FROM productividad_capturas
    WHERE servicio_id = v_servicio_id
      AND anio = v_anio AND mes = v_mes AND dia = v_dia AND turno = v_turno;

    INSERT INTO _test_resultados VALUES
      ('D', 'tipo=interconsulta codigo inexistente (silencioso)', 'ZZZ-INEXISTENTE-TEST',
       v_antes, v_despues, v_despues - v_antes, 0, v_despues = v_antes);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_resultados VALUES
      ('D', 'tipo=interconsulta codigo inexistente -> EXCEPCION: ' || SQLERRM,
       NULL, NULL, NULL, 0, false);
  END;

END $$;

-- Resultados
SELECT
  caso,
  ok,
  delta,
  delta_esperado,
  codigo,
  descripcion
FROM _test_resultados
ORDER BY caso;

-- Resumen
SELECT
  COUNT(*)                            AS total,
  COUNT(*) FILTER (WHERE ok)          AS pasaron,
  COUNT(*) FILTER (WHERE NOT ok)      AS fallaron,
  bool_and(ok)                        AS todo_paso
FROM _test_resultados;

ROLLBACK;
