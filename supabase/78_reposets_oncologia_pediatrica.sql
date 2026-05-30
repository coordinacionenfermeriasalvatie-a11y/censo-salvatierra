-- ============================================================
-- Migración 78: Reposets de Oncología Pediátrica → "Reposet 1..6"
-- ------------------------------------------------------------
-- Dictado del subjefe: las camas NO censables de Oncología Pediátrica
-- deben llamarse "Reposet 1" … "Reposet 6" (antes salían como 54–58, el
-- número correlativo tras las censables 41–53; ver mig 62).
--
-- Qué hace (idempotente):
--   1) Localiza el subservicio de Oncología Pediátrica con el MISMO selector
--      probado en la mig 62: servicio codigo='ONC' + nombre ILIKE 'ONCOLOG%'.
--      (El codigo='ONC' acota la búsqueda a ese servicio, así NO confunde con
--       'ONCOLOGIA MEDICA' u otros subservicios homónimos.)
--   2) Renombra TODAS sus camas no censables (es_censable=FALSE) a 'Reposet N'
--      en orden de creación (id) y las marca tipo_cama='REPOSET'. Marcar el
--      tipo también arregla cualquier reposet dado de alta por la UI sin la
--      etiqueta (que por eso aparecía mal en Dietas/Recetario, ver mig 63).
--   3) Completa hasta 6 reposets si hubiera menos.
--
-- Se renombra en DOS FASES (nombre temporal → final) para no chocar con el
-- UNIQUE(subservicio_id, numero_cama) mientras se renumera.
--
-- Camas BLOQUEADAS no se tocan: usan bloqueada=TRUE y siguen es_censable=TRUE,
-- así que el filtro es_censable=FALSE no las incluye.
--
-- NO rompe pacientes asignados: cambia numero_cama (texto visible), NO el id
-- de la cama (la FK pacientes.cama_id se mantiene). Tampoco cambia 'activa'
-- de las existentes (respeta una posible baja manual); el POST-CHECK la
-- muestra por si hay que revisarla.
--
-- Correr en el SQL Editor de Supabase (proyecto xdvvmtqjksebqoflvbhj).
-- ============================================================
BEGIN;

DO $$
DECLARE
  _sub_id INT;
  _count  INT;
  _i      INT;
BEGIN
  -- 1) Subservicio de Oncología Pediátrica (selector de la mig 62).
  SELECT sub.id INTO _sub_id
  FROM subservicios sub
  JOIN servicios s ON s.id = sub.servicio_id
  WHERE s.codigo = 'ONC' AND TRIM(sub.nombre) ILIKE 'ONCOLOG%'
  LIMIT 1;

  IF _sub_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el subservicio de Oncología Pediátrica (codigo ONC, nombre ILIKE ONCOLOG%%).';
  END IF;

  -- 2a) Fase temporal: evita colisiones con el UNIQUE al renumerar.
  UPDATE camas
     SET numero_cama = 'TMP_RPS_' || id::text
   WHERE subservicio_id = _sub_id
     AND es_censable = FALSE;

  -- 2b) Nombres finales 'Reposet N' por orden de creación (id) + etiqueta.
  WITH ordenadas AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
    FROM camas
    WHERE subservicio_id = _sub_id
      AND es_censable = FALSE
  )
  UPDATE camas c
     SET numero_cama = 'Reposet ' || o.rn,
         tipo_cama   = 'REPOSET'
  FROM ordenadas o
  WHERE c.id = o.id;

  -- 3) Completar hasta 6 si quedaron menos.
  SELECT COUNT(*) INTO _count
  FROM camas
  WHERE subservicio_id = _sub_id AND es_censable = FALSE;

  IF _count < 6 THEN
    FOR _i IN (_count + 1)..6 LOOP
      INSERT INTO camas (subservicio_id, numero_cama, activa, es_censable, tipo_cama)
      VALUES (_sub_id, 'Reposet ' || _i, TRUE, FALSE, 'REPOSET')
      ON CONFLICT (subservicio_id, numero_cama) DO NOTHING;
    END LOOP;
  END IF;

  RAISE NOTICE 'Oncología Pediátrica: % reposets existentes; total tras topup = %.',
    _count, GREATEST(_count, 6);
END $$;

-- POST-CHECK: deben verse Reposet 1..6, es_censable=FALSE, tipo_cama=REPOSET.
SELECT s.codigo,
       sub.nombre AS subservicio,
       c.numero_cama,
       c.es_censable,
       c.tipo_cama,
       c.activa
FROM camas c
JOIN subservicios sub ON sub.id = c.subservicio_id
JOIN servicios s      ON s.id  = sub.servicio_id
WHERE s.codigo = 'ONC' AND TRIM(sub.nombre) ILIKE 'ONCOLOG%'
  AND c.es_censable = FALSE
ORDER BY c.numero_cama;

COMMIT;
