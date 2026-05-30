-- ============================================================
-- CLASIFICAR controlados FALTANTES -> Grupo IV
-- ------------------------------------------------------------
-- Tras la mig.74 quedaron 4 presentaciones controladas en NULL
-- (no salian en el dropdown de controlados). La 74 solo aplica
-- patrones de Grupo I/II/III; el Grupo IV se sembro presentacion
-- por presentacion, asi que estas nuevas se escaparon:
--   - Haloperidol Tabletas 5 mg      (su inyectable ya estaba en IV)
--   - Propofol 500 mg/50 ml          (su 200 mg ya estaba en IV)
--   - Pregabalina 75 mg              (criterio local: se controla)
--   - Gabapentina 300 mg             (criterio local: se controla)
--
-- Match por nombre EXACTO (no ILIKE) para tocar solo estas 4 filas.
-- Idempotente: solo afecta filas con grupo_control IS NULL.
-- Correr en el SQL Editor de Supabase (proyecto xdvvmtqjksebqoflvbhj).
-- ============================================================
BEGIN;

UPDATE catalogo_medicamentos SET grupo_control = 'IV'
WHERE grupo_control IS NULL
  AND nombre IN (
    'Haloperidol Tabletas 5 mg',
    'Propofol Emulsion inyectable 500 mg/50 ml Frasco ampula de 50 ml',
    'Pregabalina 75 mg capsulas',
    'Gabapentina Capsulas 300mg'
  );

-- POST-CHECK 1: las 4 deben salir con grupo_control = 'IV'
SELECT nombre, grupo_control, activo
FROM catalogo_medicamentos
WHERE nombre IN (
    'Haloperidol Tabletas 5 mg',
    'Propofol Emulsion inyectable 500 mg/50 ml Frasco ampula de 50 ml',
    'Pregabalina 75 mg capsulas',
    'Gabapentina Capsulas 300mg'
  )
ORDER BY nombre;

-- POST-CHECK 2: total de controlados activos (debe pasar de 32 a 36)
SELECT grupo_control, COUNT(*) AS n
FROM catalogo_medicamentos
WHERE grupo_control IS NOT NULL AND activo = true
GROUP BY grupo_control
ORDER BY grupo_control;

COMMIT;
