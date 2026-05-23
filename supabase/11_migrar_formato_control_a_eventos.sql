-- ============================================================
-- MIGRACION ONE-SHOT: formato_control_paciente -> evento_apoyo_paciente
--
-- Solo pacientes ACTIVO. Convierte cada columna a 1+ filas en
-- evento_apoyo_paciente con estado='Realizada'.
--
-- DESHABILITA los triggers de productividad durante la insercion
-- para evitar doble conteo (los datos del paciente ya estan
-- contados en productividad_capturas via UI manual previa).
--
-- Idempotente: NOT EXISTS por (paciente_id, tipo, codigo).
-- Si vuelves a correr, ignora filas ya migradas.
--
-- PARSEADO ASUMIDO
--   CSV chips (interconsulta, hemoderivados, laboratorios,
--     estudios_gabinete, oxigeno): split por coma, trim,
--     1 fila por codigo no vacio.
--   Fechas-texto (formato 'YYYY-MM-DD HH:MM' guardado por
--     registrarAhora()): cast a TIMESTAMPTZ con zona Mazatlan.
--   glucemia_capilar = 'SI' -> 1 evento.
--   higiene_paciente / precauciones_aislamiento: 1 evento si no vacio.
--     Para aislamiento, codigo='K03' (cat agregado IMSS),
--     observaciones guarda el label completo "POR CONTACTO" etc.
--
-- NO se migran: riesgo_upp, riesgo_caidas, causa_no_ocupacion,
-- traslado, observaciones (siguen viviendo en formato_control_paciente).
-- ============================================================

BEGIN;

-- 1) Deshabilitar triggers para evitar inflar productividad
ALTER TABLE evento_apoyo_paciente DISABLE TRIGGER trg_evento_productividad;
ALTER TABLE evento_apoyo_paciente DISABLE TRIGGER trg_evento_continuidad_recompute;

-- ============================================================
-- 2) CSV chips: 5 columnas, 1 fila por codigo no vacio
-- ============================================================

-- Helper inline: unnest del CSV de una columna, con trim
-- Para cada (paciente, tipo, codigo) solo inserta si no existe.

-- 2.1 interconsulta -> tipo=interconsulta, codigo=nombre especialidad
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  fc.paciente_id, 'interconsulta', cod, 'Realizada',
  COALESCE(p.capturado_en, NOW()),
  NOW(),
  p.capturado_por,
  'Migrado de formato_control_paciente.interconsulta'
FROM formato_control_paciente fc
JOIN pacientes p ON p.id = fc.paciente_id
CROSS JOIN LATERAL unnest(
  string_to_array(COALESCE(NULLIF(trim(fc.interconsulta::text), ''), ''), ',')
) AS cod
WHERE p.estado = 'ACTIVO'
  AND trim(cod) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = fc.paciente_id
      AND e.tipo = 'interconsulta'
      AND e.codigo = trim(cod)
  );

-- 2.2 hemoderivados -> tipo=hemoderivado
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  fc.paciente_id, 'hemoderivado', trim(cod), 'Realizada',
  COALESCE(p.capturado_en, NOW()),
  NOW(),
  p.capturado_por,
  'Migrado de formato_control_paciente.hemoderivados'
FROM formato_control_paciente fc
JOIN pacientes p ON p.id = fc.paciente_id
CROSS JOIN LATERAL unnest(
  string_to_array(COALESCE(NULLIF(trim(fc.hemoderivados::text), ''), ''), ',')
) AS cod
WHERE p.estado = 'ACTIVO'
  AND trim(cod) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = fc.paciente_id
      AND e.tipo = 'hemoderivado'
      AND e.codigo = trim(cod)
  );

-- 2.3 laboratorios -> tipo=laboratorio
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  fc.paciente_id, 'laboratorio', trim(cod), 'Realizada',
  COALESCE(p.capturado_en, NOW()),
  NOW(),
  p.capturado_por,
  'Migrado de formato_control_paciente.laboratorios'
FROM formato_control_paciente fc
JOIN pacientes p ON p.id = fc.paciente_id
CROSS JOIN LATERAL unnest(
  string_to_array(COALESCE(NULLIF(trim(fc.laboratorios::text), ''), ''), ',')
) AS cod
WHERE p.estado = 'ACTIVO'
  AND trim(cod) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = fc.paciente_id
      AND e.tipo = 'laboratorio'
      AND e.codigo = trim(cod)
  );

-- 2.4 estudios_gabinete -> tipo=estudio_gabinete
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  fc.paciente_id, 'estudio_gabinete', trim(cod), 'Realizada',
  COALESCE(p.capturado_en, NOW()),
  NOW(),
  p.capturado_por,
  'Migrado de formato_control_paciente.estudios_gabinete'
FROM formato_control_paciente fc
JOIN pacientes p ON p.id = fc.paciente_id
CROSS JOIN LATERAL unnest(
  string_to_array(COALESCE(NULLIF(trim(fc.estudios_gabinete::text), ''), ''), ',')
) AS cod
WHERE p.estado = 'ACTIVO'
  AND trim(cod) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = fc.paciente_id
      AND e.tipo = 'estudio_gabinete'
      AND e.codigo = trim(cod)
  );

-- 2.5 oxigeno -> tipo=oxigeno (codigo cosmetico, productividad agregada OX1)
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  fc.paciente_id, 'oxigeno', trim(cod), 'Realizada',
  COALESCE(p.capturado_en, NOW()),
  NOW(),
  p.capturado_por,
  'Migrado de formato_control_paciente.oxigeno'
FROM formato_control_paciente fc
JOIN pacientes p ON p.id = fc.paciente_id
CROSS JOIN LATERAL unnest(
  string_to_array(COALESCE(NULLIF(trim(fc.oxigeno::text), ''), ''), ',')
) AS cod
WHERE p.estado = 'ACTIVO'
  AND trim(cod) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = fc.paciente_id
      AND e.tipo = 'oxigeno'
      AND e.codigo = trim(cod)
  );

-- ============================================================
-- 3) Valores unicos: glucemia (SI/NO), higiene, aislamiento
-- ============================================================

-- 3.1 glucemia_capilar = 'SI' -> 1 evento
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  fc.paciente_id, 'glucemia', 'GLUCEMIA', 'Realizada',
  COALESCE(p.capturado_en, NOW()),
  NOW(),
  p.capturado_por,
  'Migrado de formato_control_paciente.glucemia_capilar'
FROM formato_control_paciente fc
JOIN pacientes p ON p.id = fc.paciente_id
WHERE p.estado = 'ACTIVO'
  AND upper(trim(fc.glucemia_capilar::text)) = 'SI'
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = fc.paciente_id
      AND e.tipo = 'glucemia'
      AND e.codigo = 'GLUCEMIA'
  );

-- 3.2 higiene_paciente -> 1 evento si no nulo (codigo del dropdown, ej. 'BAÑO')
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  fc.paciente_id, 'higiene', trim(fc.higiene_paciente::text), 'Realizada',
  COALESCE(p.capturado_en, NOW()),
  NOW(),
  p.capturado_por,
  'Migrado de formato_control_paciente.higiene_paciente'
FROM formato_control_paciente fc
JOIN pacientes p ON p.id = fc.paciente_id
WHERE p.estado = 'ACTIVO'
  AND NULLIF(trim(fc.higiene_paciente::text), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = fc.paciente_id
      AND e.tipo = 'higiene'
      AND e.codigo = trim(fc.higiene_paciente::text)
  );

-- 3.3 precauciones_aislamiento -> 1 evento codigo=K03, label completo a observaciones
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  fc.paciente_id, 'precaucion_aislamiento', 'K03', 'Realizada',
  COALESCE(p.capturado_en, NOW()),
  NOW(),
  p.capturado_por,
  'Migrado de formato_control_paciente.precauciones_aislamiento: '
    || trim(fc.precauciones_aislamiento::text)
FROM formato_control_paciente fc
JOIN pacientes p ON p.id = fc.paciente_id
WHERE p.estado = 'ACTIVO'
  AND NULLIF(trim(fc.precauciones_aislamiento::text), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = fc.paciente_id
      AND e.tipo = 'precaucion_aislamiento'
      AND e.codigo = 'K03'
  );

-- ============================================================
-- 4) Fechas-texto (formato YYYY-MM-DD HH:MM) -> eventos con fecha_realizacion
-- ============================================================

-- Helper: convierte 'YYYY-MM-DD HH:MM' (zona Mazatlan) a TIMESTAMPTZ.
-- Si la columna esta vacia retorna NULL; si tiene texto invalido, falla
-- (intencional: queremos saber si hay datos sucios).

-- 4.1 Accesos vasculares -> tipo=acceso_vascular
WITH src(paciente_id, codigo, fecha_txt) AS (
  SELECT fc.paciente_id, 'VM',         fc.ventilacion_mecanica::text FROM formato_control_paciente fc UNION ALL
  SELECT fc.paciente_id, 'CVP',        fc.cvp_instalacion::text       FROM formato_control_paciente fc UNION ALL
  SELECT fc.paciente_id, 'CVC',        fc.cvc_instalacion::text       FROM formato_control_paciente fc UNION ALL
  SELECT fc.paciente_id, 'UMBILICAL',  fc.cateter_umbilical::text     FROM formato_control_paciente fc
)
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  src.paciente_id,
  CASE src.codigo WHEN 'VM' THEN 'dispositivo' ELSE 'acceso_vascular' END,
  src.codigo,
  'Realizada',
  (trim(src.fecha_txt) || ' America/Mazatlan')::timestamptz,
  (trim(src.fecha_txt) || ' America/Mazatlan')::timestamptz,
  p.capturado_por,
  'Migrado: instalacion ' || src.codigo
FROM src
JOIN pacientes p ON p.id = src.paciente_id
WHERE p.estado = 'ACTIVO'
  AND NULLIF(trim(src.fecha_txt), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = src.paciente_id
      AND e.codigo = src.codigo
      AND e.tipo IN ('acceso_vascular', 'dispositivo')
  );

-- 4.2 Sondas y cateter urinario -> tipo=sonda
WITH src(paciente_id, codigo, fecha_txt) AS (
  SELECT fc.paciente_id, 'SG',  fc.sonda_gastrica::text     FROM formato_control_paciente fc UNION ALL
  SELECT fc.paciente_id, 'SPL', fc.sonda_pleurostomia::text FROM formato_control_paciente fc UNION ALL
  SELECT fc.paciente_id, 'CU',  fc.cateter_urinario::text   FROM formato_control_paciente fc
)
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  src.paciente_id, 'sonda', src.codigo, 'Realizada',
  (trim(src.fecha_txt) || ' America/Mazatlan')::timestamptz,
  (trim(src.fecha_txt) || ' America/Mazatlan')::timestamptz,
  p.capturado_por,
  'Migrado: instalacion ' || src.codigo
FROM src
JOIN pacientes p ON p.id = src.paciente_id
WHERE p.estado = 'ACTIVO'
  AND NULLIF(trim(src.fecha_txt), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = src.paciente_id
      AND e.tipo = 'sonda'
      AND e.codigo = src.codigo
  );

-- 4.3 Curaciones -> tipo=curacion (codigo cosmetico, productividad CUR1)
WITH src(paciente_id, codigo, fecha_txt) AS (
  SELECT fc.paciente_id, 'CUR_CVP', fc.curacion_cvp::text   FROM formato_control_paciente fc UNION ALL
  SELECT fc.paciente_id, 'CUR_CVC', fc.curacion_cvc::text   FROM formato_control_paciente fc UNION ALL
  SELECT fc.paciente_id, 'REF_CVC', fc.refijacion_cvc::text FROM formato_control_paciente fc UNION ALL
  SELECT fc.paciente_id, 'HERIDA',  fc.heridas::text         FROM formato_control_paciente fc
)
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  src.paciente_id, 'curacion', src.codigo, 'Realizada',
  (trim(src.fecha_txt) || ' America/Mazatlan')::timestamptz,
  (trim(src.fecha_txt) || ' America/Mazatlan')::timestamptz,
  p.capturado_por,
  'Migrado: curacion ' || src.codigo
FROM src
JOIN pacientes p ON p.id = src.paciente_id
WHERE p.estado = 'ACTIVO'
  AND NULLIF(trim(src.fecha_txt), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = src.paciente_id
      AND e.tipo = 'curacion'
      AND e.codigo = src.codigo
  );

-- 4.4 Procedimientos -> tipo=procedimiento (codigo cosmetico, productividad PRC1)
WITH src(paciente_id, codigo, fecha_txt, obs) AS (
  SELECT fc.paciente_id, 'EST', fc.estomas::text,             NULL            FROM formato_control_paciente fc UNION ALL
  SELECT fc.paciente_id, 'SUT', fc.suturas_realizadas::text,  NULL            FROM formato_control_paciente fc UNION ALL
  SELECT fc.paciente_id, 'LIS', NULL::text,                   fc.lisis_lavado_cateter::text FROM formato_control_paciente fc
)
INSERT INTO evento_apoyo_paciente
  (paciente_id, tipo, codigo, estado, fecha_solicitud, fecha_realizacion, capturado_por, observaciones)
SELECT
  src.paciente_id, 'procedimiento', src.codigo, 'Realizada',
  CASE WHEN NULLIF(trim(src.fecha_txt), '') IS NOT NULL
       THEN (trim(src.fecha_txt) || ' America/Mazatlan')::timestamptz
       ELSE NOW() END,
  CASE WHEN NULLIF(trim(src.fecha_txt), '') IS NOT NULL
       THEN (trim(src.fecha_txt) || ' America/Mazatlan')::timestamptz
       ELSE NOW() END,
  p.capturado_por,
  COALESCE('Migrado: ' || src.codigo || COALESCE(' - ' || src.obs, ''),
           'Migrado: ' || src.codigo)
FROM src
JOIN pacientes p ON p.id = src.paciente_id
WHERE p.estado = 'ACTIVO'
  AND (
    NULLIF(trim(src.fecha_txt), '') IS NOT NULL
    OR NULLIF(trim(src.obs), '') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM evento_apoyo_paciente e
    WHERE e.paciente_id = src.paciente_id
      AND e.tipo = 'procedimiento'
      AND e.codigo = src.codigo
  );

-- ============================================================
-- 5) Reactivar triggers
-- ============================================================
ALTER TABLE evento_apoyo_paciente ENABLE TRIGGER trg_evento_productividad;
ALTER TABLE evento_apoyo_paciente ENABLE TRIGGER trg_evento_continuidad_recompute;

-- ============================================================
-- 6) Resumen post-migracion
-- ============================================================
SELECT
  tipo,
  COUNT(*) AS eventos_migrados,
  COUNT(DISTINCT paciente_id) AS pacientes,
  MIN(capturado_en) AS primer_migrado,
  MAX(capturado_en) AS ultimo_migrado
FROM evento_apoyo_paciente
WHERE observaciones LIKE 'Migrado%'
GROUP BY tipo
ORDER BY tipo;

COMMIT;
