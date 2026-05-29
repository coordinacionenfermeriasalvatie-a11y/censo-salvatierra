-- 66_quimioterapia_y_solo_pediatria.sql
-- 1) "Aplicación de quimioterapia" como indicador de captura MANUAL
--    (celda amarilla editable en la rejilla de Productividad).
-- 2) Columna solo_pediatria para ocultar indicadores neonatales fuera de Pediatría
--    (la app ya filtra por esta columna; mientras no exista, no filtra nada).
-- Idempotente: re-ejecutable sin duplicar.

BEGIN;

-- 1) Exclusividad pediátrica -------------------------------------------------
ALTER TABLE catalogo_indicadores_productividad
  ADD COLUMN IF NOT EXISTS solo_pediatria boolean NOT NULL DEFAULT false;

-- Marca neonatales/umbilical como exclusivos de Pediatría.
-- Por código conocido (V05 CVP neonatos instalación, V07 refijación,
-- V08 curación, V25 catéter umbilical) y, por robustez, por patrón de etiqueta.
UPDATE catalogo_indicadores_productividad
   SET solo_pediatria = true
 WHERE codigo IN ('V05','V07','V08','V25')
    OR etiqueta ILIKE '%neonat%'
    OR etiqueta ILIKE '%umbilical%';

-- 2) Quimioterapia (captura MANUAL) -----------------------------------------
-- Se cuelga del mismo proceso que AV1 (TERAPIA DE INFUSIÓN) y se coloca al
-- final de ese proceso. origen=MANUAL => celda amarilla editable en la rejilla.
INSERT INTO catalogo_indicadores_productividad
  (codigo, proceso_id, proceso_nom, subproceso, etiqueta, origen, orden, activo)
SELECT 'QT1', av.proceso_id, av.proceso_nom, 'QUIMIOTERAPIA',
       'Aplicación de quimioterapia', 'MANUAL',
       (SELECT COALESCE(MAX(c.orden),0)+1
          FROM catalogo_indicadores_productividad c
         WHERE c.proceso_id = av.proceso_id),
       true
  FROM catalogo_indicadores_productividad av
 WHERE av.codigo = 'AV1'
   AND NOT EXISTS (
     SELECT 1 FROM catalogo_indicadores_productividad WHERE codigo = 'QT1'
   );

COMMIT;

-- Verificación:
-- SELECT codigo, etiqueta, origen, solo_pediatria
--   FROM catalogo_indicadores_productividad
--  WHERE codigo IN ('QT1','V05','V07','V08','V25')
--  ORDER BY codigo;
