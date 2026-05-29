-- ============================================================
-- Migración 59: Dropdown de receta controlada = EXACTAMENTE el
--               fondo fijo de psicotrópicos (lista en papel).
-- ============================================================
-- Contexto:
--   La migración 47 clasificó grupo_control con patrones ILIKE amplios,
--   así que el dropdown de "Receta de medicamento controlado"
--   (ModalRecetaControlada, único consumidor de grupo_control) mostraba
--   TODAS las presentaciones y marcas de cada fármaco controlado
--   (parches, soluciones orales, tabletas extra, variantes PSICOFARMA…).
--
--   El usuario quiere que el dropdown muestre SOLO los medicamentos del
--   fondo fijo del hospital (los 12 impresos en la hoja + Diazepam tab.
--   agregado a mano = 13), una presentación por med, genérico sobre marca.
--
-- Mecánica:
--   1) Reset: grupo_control = NULL en todo el catálogo.
--   2) Set grupo_control SOLO en las 13 filas canónicas (match por nombre
--      exacto del catálogo 03), conservando la fracción legal del esquema
--      original (I = estupefacientes, III = benzodiacepinas) y IV para los
--      de control institucional (Propofol/Haloperidol/Flumazenil/Amitriptilina).
--      También fuerza activo = TRUE (el dropdown filtra activo).
--
-- Sin cambio de frontend, sin redeploy: el dropdown lee datos vivos.
-- Idempotente: se puede correr varias veces.
-- ============================================================

-- 1) Reset total -----------------------------------------------
UPDATE catalogo_medicamentos
SET grupo_control = NULL
WHERE grupo_control IS NOT NULL;

-- 2a) Grupo I — estupefacientes --------------------------------
UPDATE catalogo_medicamentos
SET grupo_control = 'I', activo = TRUE
WHERE nombre IN (
  'Morfina Solucion inyectable 10 mg/ml',
  'Fentanilo (Fentanil) Solucion inyectable 0.5mg/10ml ampolletas c/10 ml',
  'Buprenorfina Solucion inyectable 0.30mg/ml. frasco ampula c/1ml',
  'Nalbufina Solucion inyectable 10 mg/ml'
);

-- 2b) Grupo III — benzodiacepinas y similares ------------------
UPDATE catalogo_medicamentos
SET grupo_control = 'III', activo = TRUE
WHERE nombre IN (
  'Diazepam Solucion inyectable 10 mg/2 ml ampolletas c/2ml',
  'Diazepam Tabletas 10 mg',
  'Midazolam Solucion inyectable 15mg/3ml. Ampolletas c/3ml',
  'Lorazepam Tabletas 1 mg',
  'Clonazepam Tabletas 2 mg'
);

-- 2c) Grupo IV — control institucional -------------------------
UPDATE catalogo_medicamentos
SET grupo_control = 'IV', activo = TRUE
WHERE nombre IN (
  'Flumazenil Solucion inyectable 0.5mg/5 ml ampolleta c/5ml',
  'Haloperidol Solucion inyectable 5 mg/ ml 6 ampolletas con un ml',
  'Propofol Emulsion inyectable 200 mg/20 ml ampolletas o frascos ampula c/20ml',
  'Amitriptilina Tabletas 25 mg'
);

-- 3) POST-CHECK — esto es EXACTAMENTE lo que verá el dropdown ---
--    Debe devolver 13 filas (4 grupo I + 5 grupo III + 4 grupo IV).
SELECT grupo_control, nombre
FROM catalogo_medicamentos
WHERE grupo_control IS NOT NULL AND activo
ORDER BY grupo_control, nombre;
