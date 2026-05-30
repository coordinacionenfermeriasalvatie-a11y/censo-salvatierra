-- ============================================================
-- Migración 81: "Administración de quimioterapia" como indicador NUEVO
--               de Productividad (APARTE de QT1 "Aplicación").
-- ------------------------------------------------------------
-- Dictado del subjefe: agregar "administración de quimioterapia" a la hoja
-- de Productividad de Oncología Pediátrica y de TODOS los servicios.
--
-- Contexto: la mig 62/66 ya dejó QT1 "Aplicación de quimioterapia" (MANUAL,
-- proceso 2 = TERAPIA DE INFUSION, subproceso QUIMIOTERAPIA, global). El
-- usuario pidió un indicador SEPARADO, así que QT1 se deja intacto y se
-- agrega QT2 "Administración de quimioterapia" como segundo renglón.
--
-- Qué hace (idempotente):
--   Inserta QT2 colgado del MISMO proceso que AV1 (TERAPIA DE INFUSION),
--   subproceso QUIMIOTERAPIA, origen=MANUAL (celda amarilla editable en la
--   rejilla), al final de ese proceso (MAX(orden)+1, queda junto a QT1).
--   NO marca solo_pediatria => default FALSE => aparece en TODOS los
--   servicios, incluida Oncología Pediátrica. activo=TRUE.
--   El NOT EXISTS sobre codigo='QT2' lo hace re-ejecutable sin duplicar.
--
-- Por qué basta un INSERT (sin tocar código): el catálogo alimenta las 3
-- vistas de Productividad:
--   - Web (VistaProductividad): lee catalogo_indicadores_productividad
--     filtrando activo=TRUE y solo_pediatria.
--   - Impresión + Excel: leen v_productividad_export_mensual, que cruza
--     servicios × catálogo, así que el nuevo renglón aparece para todos
--     (en impresión suma al total del proceso 2; en Excel sale su renglón).
--
-- Correr en el SQL Editor de Supabase (proyecto xdvvmtqjksebqoflvbhj).
-- ============================================================
BEGIN;

INSERT INTO catalogo_indicadores_productividad
  (codigo, proceso_id, proceso_nom, subproceso, etiqueta, origen, orden, activo)
SELECT 'QT2', av.proceso_id, av.proceso_nom, 'QUIMIOTERAPIA',
       'Administración de quimioterapia', 'MANUAL',
       (SELECT COALESCE(MAX(c.orden),0)+1
          FROM catalogo_indicadores_productividad c
         WHERE c.proceso_id = av.proceso_id),
       true
  FROM catalogo_indicadores_productividad av
 WHERE av.codigo = 'AV1'
   AND NOT EXISTS (
     SELECT 1 FROM catalogo_indicadores_productividad WHERE codigo = 'QT2'
   );

COMMIT;

-- POST-CHECK: deben verse QT1 (Aplicación) y QT2 (Administración), ambos
-- MANUAL, proceso 2 (TERAPIA DE INFUSION), subproceso QUIMIOTERAPIA,
-- activos y solo_pediatria=false (globales).
SELECT codigo, proceso_id, proceso_nom, subproceso, etiqueta,
       origen, orden, activo, solo_pediatria
FROM catalogo_indicadores_productividad
WHERE codigo IN ('QT1', 'QT2')
ORDER BY orden;
