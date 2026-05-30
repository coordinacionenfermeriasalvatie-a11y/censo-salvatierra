-- ============================================================
-- FIX FOLIO RECETAS CONTROLADAS  (resync de la secuencia)
-- ------------------------------------------------------------
-- Sintoma: "duplicate key value violates unique constraint
--   recetas_controladas_folio_key" al guardar (ej. gestor Carlos Reyes).
-- Causa: seq_folio_receta_controlada quedo por DEBAJO del sufijo de folio
--   maximo ya usado -> nextval() repite un folio que ya existe.
-- Folio = 'BSIMB-' || año || '-' || LPAD(nextval, 5, '0').  Secuencia global.
-- Fix: reposicionar la secuencia justo arriba del sufijo numerico maximo.
-- Idempotente (se puede correr varias veces). SQL Editor de Supabase.
-- ============================================================

-- (A) Diagnostico ANTES: valor de la secuencia vs. sufijo maximo usado
SELECT
  (SELECT last_value FROM seq_folio_receta_controlada) AS seq_actual,
  (SELECT COALESCE(MAX((substring(folio from '[0-9]+$'))::int), 0)
     FROM recetas_controladas) AS max_sufijo_usado;

-- (B) Resync: la proxima receta tomara (max_sufijo + 1)
SELECT setval(
  'seq_folio_receta_controlada',
  (SELECT COALESCE(MAX((substring(folio from '[0-9]+$'))::int), 0)
     FROM recetas_controladas) + 1,
  false   -- is_called=false => el proximo nextval() devuelve exactamente ese valor
) AS proximo_folio_num;

-- (C) Verificacion: como quedaria el proximo folio (sin consumir la secuencia)
SELECT 'BSIMB-' || EXTRACT(YEAR FROM NOW())::int
       || '-' || LPAD((SELECT last_value FROM seq_folio_receta_controlada)::text, 5, '0')
       AS proximo_folio_estimado;
