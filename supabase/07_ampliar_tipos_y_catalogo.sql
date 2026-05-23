-- ============================================================
-- MIGRACION: ampliar tipos de evento + agregar indicadores
--
-- El SQL 04 ya esta aplicado. Esto:
--   1. Amplia el CHECK de evento_apoyo_paciente.tipo
--   2. Agrega 6 indicadores agregados al catalogo:
--      K06 Higiene, K07 Glucemia (seccion 8)
--      OX1 Oxigenoterapia (seccion 4)
--      AV1 Accesos vasculares (seccion 2)
--      SD1 Sondas, DP1 Dispositivos (seccion 3)
--
-- Esquema real de catalogo_indicadores_productividad:
--   id, codigo, proceso_id, proceso_nom, subproceso, etiqueta,
--   origen, orden, activo
--
-- Idempotente: el INSERT usa NOT EXISTS, NO requiere UNIQUE en codigo.
-- ============================================================

-- 1) Ampliar CHECK del tipo
ALTER TABLE evento_apoyo_paciente
  DROP CONSTRAINT IF EXISTS evento_apoyo_paciente_tipo_check;

ALTER TABLE evento_apoyo_paciente
  ADD CONSTRAINT evento_apoyo_paciente_tipo_check
  CHECK (tipo IN (
    'interconsulta',
    'hemoderivado',
    'laboratorio',
    'estudio_gabinete',
    'sonda',
    'dispositivo',
    'procedimiento',
    'curacion',
    'acceso_vascular',
    'oxigeno',
    'higiene',
    'glucemia',
    'precaucion_aislamiento'
  ));

-- 2) Agregar 6 indicadores al catalogo (idempotente)
WITH new_indicadores(codigo, proceso_id, proceso_nom, etiqueta, origen) AS (
  VALUES
    ('K06', 8, 'INDICADORES DE CALIDAD',         'Higiene del paciente',                  'MANUAL'),
    ('K07', 8, 'INDICADORES DE CALIDAD',         'Glucemia capilar',                      'MANUAL'),
    ('OX1', 4, 'VENTILACION Y T. SUSTITUTIVA',   'Oxigenoterapia (cualquier modalidad)',  'MANUAL'),
    ('AV1', 2, 'TERAPIA DE INFUSION',            'Accesos vasculares (cualquier tipo)',   'MANUAL'),
    ('SD1', 3, 'SONDAS Y DISPOSITIVOS',          'Sondas (cualquier tipo)',               'MANUAL'),
    ('DP1', 3, 'SONDAS Y DISPOSITIVOS',          'Dispositivos (cualquier tipo)',         'MANUAL')
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
WHERE codigo IN ('K06','K07','OX1','AV1','SD1','DP1')
ORDER BY proceso_id, orden;
