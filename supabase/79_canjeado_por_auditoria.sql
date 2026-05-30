-- ============================================================
-- AUDITORIA DEL CANJE: agregar canjeado_por / canjeado_nombre
-- ------------------------------------------------------------
-- recetas_controladas ya registra QUIEN aprueba (aprobado_por /
-- aprobado_nombre, mig.48) y QUIEN anula (cancelada_por / cancelada_nombre,
-- mig.47), pero al CANJEAR (surtir) solo se guardaba canjeado_en (mig.48).
-- Quedaba sin rastro de QUIEN marco la receta como canjeada.
--
-- Esta migracion agrega las 2 columnas faltantes con el MISMO patron que
-- aprobado_por/aprobado_nombre:
--   canjeado_por    UUID  -> FK a perfiles(id)
--   canjeado_nombre TEXT  -> snapshot del nombre (para no depender del join)
--
-- ORDEN DE DESPLIEGUE (importante):
--   1) Correr ESTA migracion primero (agrega las columnas).
--   2) Luego desplegar el frontend que escribe canjeado_por/canjeado_nombre
--      en BitacoraSupervision.marcarCanjeada. Si se invierte el orden, el
--      UPDATE del frontend falla (columna inexistente) y rompe el canje.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (se puede correr varias veces).
-- No requiere tocar el trigger de canje ni las vistas: el frontend escribe
-- directo sobre la tabla recetas_controladas.
-- Correr en el SQL Editor de Supabase (proyecto xdvvmtqjksebqoflvbhj).
-- ============================================================
BEGIN;

ALTER TABLE recetas_controladas
  ADD COLUMN IF NOT EXISTS canjeado_por    UUID REFERENCES perfiles(id),
  ADD COLUMN IF NOT EXISTS canjeado_nombre TEXT;

-- POST-CHECK: las 2 columnas deben existir
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'recetas_controladas'
  AND column_name IN ('canjeado_por', 'canjeado_nombre')
ORDER BY column_name;

COMMIT;
