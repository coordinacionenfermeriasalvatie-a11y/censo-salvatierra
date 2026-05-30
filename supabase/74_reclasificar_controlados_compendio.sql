-- ============================================================
-- RECLASIFICAR CONTROLADOS sobre el COMPENDIO NUEVO
-- ------------------------------------------------------------
-- Tras reemplazar el catalogo, varios controlados entraron con nombre
-- nuevo y quedaron SIN grupo_control => NO aparecen en el dropdown de
-- recetas controladas. Esto re-aplica los patrones de la mig.47 a los
-- nombres nuevos.  Idempotente: solo toca filas con grupo_control IS NULL,
-- NO cambia las que ya estaban clasificadas (los 13 actuales).
-- Incluye Diazepam Tabletas 10 mg (y el inyectable) en Grupo III.
--
-- NOTA LEGAL: este app agrupa las benzodiacepinas en Grupo III (mig.47).
-- Si tu norma local exige Grupo IV para diazepam/benzodiacepinas, avisame
-- y lo cambio antes de correr.
-- Correr en el SQL Editor de Supabase (proyecto xdvvmtqjksebqoflvbhj).
-- ============================================================
BEGIN;

-- Grupo I (estupefacientes / opioides)
UPDATE catalogo_medicamentos SET grupo_control = 'I'
WHERE grupo_control IS NULL AND (
  nombre ILIKE '%morfina%'        OR nombre ILIKE '%fentanil%'      OR nombre ILIKE '%buprenorfin%' OR
  nombre ILIKE '%codein%'         OR nombre ILIKE '%hidromorfon%'   OR nombre ILIKE '%metadona%'    OR
  nombre ILIKE '%oxicodon%'       OR nombre ILIKE '%nalbufin%'      OR nombre ILIKE '%petidin%'     OR
  nombre ILIKE '%meperidin%'      OR nombre ILIKE '%sufentanil%'    OR nombre ILIKE '%remifentanil%' OR
  nombre ILIKE '%dextropropoxifen%' OR nombre ILIKE '%nalmefen%'
);

-- Grupo II (psicotropicos potentes)
UPDATE catalogo_medicamentos SET grupo_control = 'II'
WHERE grupo_control IS NULL AND (
  nombre ILIKE '%metilfenidat%'   OR nombre ILIKE '%anfetamin%'     OR nombre ILIKE '%dexanfetamin%' OR
  nombre ILIKE '%pentobarbital%'  OR nombre ILIKE '%secobarbital%'  OR nombre ILIKE '%amobarbital%' OR
  nombre ILIKE '%ketamin%'
);

-- Grupo III (benzodiacepinas y similares) -- incluye DIAZEPAM
UPDATE catalogo_medicamentos SET grupo_control = 'III'
WHERE grupo_control IS NULL AND (
  nombre ILIKE '%diazepam%'       OR nombre ILIKE '%midazolam%'     OR nombre ILIKE '%lorazepam%'   OR
  nombre ILIKE '%alprazolam%'     OR nombre ILIKE '%clonazepam%'    OR nombre ILIKE '%bromazepam%'  OR
  nombre ILIKE '%flunitrazepam%'  OR nombre ILIKE '%triazolam%'     OR nombre ILIKE '%fenobarbital%' OR
  nombre ILIKE '%tramadol%'       OR nombre ILIKE '%clordiazep%'    OR nombre ILIKE '%nitrazepam%'  OR
  nombre ILIKE '%zolpidem%'       OR nombre ILIKE '%zopiclon%'
);

-- POST-CHECK: lista final de CONTROLADOS activos (lo que vera el dropdown)
SELECT grupo_control, nombre
FROM catalogo_medicamentos
WHERE grupo_control IS NOT NULL AND activo = true
ORDER BY grupo_control, nombre;

COMMIT;
