-- ============================================================
-- AGREGAR DIAZEPAM TABLETAS 10 mg como FONDO FIJO (Sup 1 y Sup 2)
-- ------------------------------------------------------------
-- Pedido: en AMBAS bitacoras de psicotropicos (supervision 1 y 2),
--   agregar Diazepam Tabletas 10 mg con stock (fondo fijo) = 10.
--
-- Por que una fila NUEVA de inventario:
--   inventario_psicotropicos.nombre es UNIQUE y la fila 'Diazepam' que
--   ya existe es la INYECTABLE (Solucion inyectable 10 mg/2 ml, fondo 20).
--   La tableta es otra presentacion => fila aparte.
--
-- Desambiguacion del trigger de canje (fn_registrar_canje_psicotropico):
--   el trigger hace  receta.medicamento_nombre ILIKE '%' || nombre || '%'
--   y elige el nombre MAS LARGO. El catalogo usa:
--     - inyectable: 'Diazepam Solucion inyectable 10 mg/2 ml ampolletas c/2ml'
--     - tableta   : 'Diazepam Tabletas 10 mg'
--   Con nombre de inventario 'Diazepam Tabletas' (len 17):
--     * vale de tableta  -> matchea 'Diazepam' (8) Y 'Diazepam Tabletas' (17)
--                           => gana el de 17 = TABLETA  (correcto)
--     * vale de inyectable -> solo matchea 'Diazepam' (8)
--                           => INYECTABLE                (correcto)
--
-- orden = 13 (se agrega al final de la lista; no re-numera a los 12 existentes;
--   por eso las 2 presentaciones de Diazepam no quedan juntas en la bitacora).
-- No requiere cambio de frontend: la vista v_stock_psicotropicos_hoy ya
--   arma 1 fila por (supervision x medicamento) desde fondo_fijo_psicotropicos.
--
-- Idempotente: se puede correr varias veces (ON CONFLICT DO UPDATE).
-- Correr en el SQL Editor de Supabase (proyecto xdvvmtqjksebqoflvbhj).
-- ============================================================
BEGIN;

-- 1) Fila de inventario para la TABLETA (la fila 'Diazepam' = inyectable)
INSERT INTO inventario_psicotropicos
  (nombre, presentacion, unidad, fondo_fijo, orden)
VALUES
  ('Diazepam Tabletas', 'Tabletas 10 mg', 'Tabletas', 10, 13)
ON CONFLICT (nombre) DO UPDATE
  SET presentacion = EXCLUDED.presentacion,
      unidad       = EXCLUDED.unidad,
      fondo_fijo   = EXCLUDED.fondo_fijo,
      activo       = true;

-- 2) Fondo fijo en AMBAS supervisiones (1 y 2) con stock = 10
INSERT INTO fondo_fijo_psicotropicos (inventario_id, supervision, fondo_fijo)
SELECT inv.id, s.supervision, 10
FROM inventario_psicotropicos inv
CROSS JOIN (VALUES (1::smallint), (2::smallint)) AS s(supervision)
WHERE inv.nombre = 'Diazepam Tabletas'
ON CONFLICT (inventario_id, supervision)
DO UPDATE SET fondo_fijo = EXCLUDED.fondo_fijo;

-- 3) POST-CHECK: 2 filas (sup 1 y sup 2), ambas con fondo_fijo = 10
SELECT ff.supervision, inv.orden, inv.nombre, inv.presentacion,
       inv.unidad, ff.fondo_fijo
FROM fondo_fijo_psicotropicos ff
JOIN inventario_psicotropicos inv ON inv.id = ff.inventario_id
WHERE inv.nombre = 'Diazepam Tabletas'
ORDER BY ff.supervision;

COMMIT;
