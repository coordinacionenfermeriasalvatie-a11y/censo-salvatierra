-- ============================================================
-- MIGRACION: agregar indicadores CUR1 y PRC1
--
-- Curaciones (curacion_cvp, curacion_cvc, refijacion_cvc, heridas)
-- y procedimientos (estomas, suturas_realizadas, lisis_lavado_cateter)
-- pasan a manejarse como tipos "categoria" igual que oxigeno/sondas:
-- el codigo del evento es cosmetico (CVP, EST, SUT, etc) y el trigger
-- lo mapea a un indicador agregado en productividad.
--
-- Nuevos indicadores:
--   CUR1 (proceso 6 - CURACIONES Y CUIDADOS DE LA PIEL): cualquier curacion
--   PRC1 (proceso 7 - PROCEDIMIENTOS INVASIVOS): cualquier procedimiento
--
-- NOTA: proceso_id se elige de los procesos existentes en
-- catalogo_indicadores_productividad. Si tu institucion usa otros
-- numeros, ajusta proceso_id y proceso_nom antes de aplicar.
--
-- Idempotente.
-- ============================================================

WITH new_indicadores(codigo, proceso_id, proceso_nom, etiqueta, origen) AS (
  VALUES
    ('CUR1', 6, 'CURACIONES Y CUIDADOS DE LA PIEL', 'Curaciones (cualquier tipo)',     'MANUAL'),
    ('PRC1', 7, 'PROCEDIMIENTOS INVASIVOS',         'Procedimientos (cualquier tipo)', 'MANUAL')
),
maxes AS (
  SELECT proceso_id, COALESCE(MAX(orden), 0) AS max_orden
  FROM catalogo_indicadores_productividad
  GROUP BY proceso_id
)
INSERT INTO catalogo_indicadores_productividad
  (codigo, proceso_id, proceso_nom, etiqueta, origen, orden, activo)
SELECT
  n.codigo,
  n.proceso_id,
  n.proceso_nom,
  n.etiqueta,
  n.origen,
  COALESCE(m.max_orden, 0) + ROW_NUMBER() OVER (PARTITION BY n.proceso_id ORDER BY n.codigo),
  true
FROM new_indicadores n
LEFT JOIN maxes m ON m.proceso_id = n.proceso_id
WHERE NOT EXISTS (
  SELECT 1 FROM catalogo_indicadores_productividad c
  WHERE c.codigo = n.codigo
);

-- Verificacion
SELECT codigo, proceso_id, proceso_nom, etiqueta, origen, orden
FROM catalogo_indicadores_productividad
WHERE codigo IN ('CUR1', 'PRC1')
ORDER BY codigo;
