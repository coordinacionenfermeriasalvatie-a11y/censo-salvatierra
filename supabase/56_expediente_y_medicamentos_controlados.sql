-- ============================================================
-- Migración 56: Número de expediente independiente + medicamentos
--               controlados adicionales (Propofol / Haloperidol)
-- ============================================================
-- Cambios:
--   1) pacientes.expediente  → número de expediente INDEPENDIENTE de la
--      CURP y de la fecha de nacimiento. Lo captura el gestor en el
--      Censo (ModalIngreso) y se imprime por separado en la ficha 🪪.
--   2) Propofol y Haloperidol INYECTADOS → grupo_control = 'IV' para que
--      aparezcan en el dropdown de "Receta de medicamento controlado".
--      Ambos ya existen en catalogo_medicamentos; solo les falta el grupo.
--
-- IMPORTANTE: aplicar ANTES de desplegar el frontend nuevo, porque la
-- ficha y el ingreso ya leen/escriben pacientes.expediente.
-- Idempotente: se puede correr varias veces sin efectos secundarios.
-- ============================================================

-- 1) Columna de expediente -----------------------------------
ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS expediente TEXT;

COMMENT ON COLUMN pacientes.expediente IS
  'Número de expediente clínico, independiente de nss_curp (CURP) y de fecha_nacimiento. Capturado al ingreso.';

-- 2) Clasificar Propofol y Haloperidol inyectable ------------
--    Grupo IV (control institucional, sin etiqueta legal de estupefaciente).
--    Solo el inyectable de haloperidol; las tabletas quedan fuera.
UPDATE catalogo_medicamentos
SET grupo_control = 'IV'
WHERE grupo_control IS NULL
  AND (
    nombre ILIKE '%propofol%'
    OR (nombre ILIKE '%haloperidol%' AND nombre ILIKE '%inyectable%')
  );

-- 3) POST-CHECK ----------------------------------------------
SELECT 'columna expediente' AS check,
       COUNT(*) FILTER (WHERE column_name = 'expediente') AS ok
FROM information_schema.columns
WHERE table_name = 'pacientes'
UNION ALL
SELECT 'propofol/haloperidol controlados',
       COUNT(*)
FROM catalogo_medicamentos
WHERE grupo_control IS NOT NULL
  AND (nombre ILIKE '%propofol%'
       OR (nombre ILIKE '%haloperidol%' AND nombre ILIKE '%inyectable%'));
