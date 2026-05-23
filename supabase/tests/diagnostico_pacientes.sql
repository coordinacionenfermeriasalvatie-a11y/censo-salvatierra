-- ============================================================
-- DIAGNOSTICO de pacientes ACTIVO en el Censo
--
-- READ-ONLY. No modifica nada. Sirve para identificar
-- candidatos a limpieza antes de abrir a enfermeras reales.
--
-- Devuelve 5 resultsets:
--   1) Resumen global
--   2) Pacientes por servicio
--   3) Histograma por mes de ingreso
--   4) Pacientes con nombres sospechosos (PRUEBA/TEST/XXX/DEMO/...)
--   5) Pacientes con dias_estancia > 30 (posible test viejo)
-- ============================================================

-- 1) RESUMEN GLOBAL
SELECT
  'Pacientes ACTIVO totales' AS metrica,
  COUNT(*)::text AS valor
FROM pacientes
WHERE estado = 'ACTIVO'
UNION ALL
SELECT
  'Pacientes EGRESADO totales',
  COUNT(*)::text
FROM pacientes
WHERE estado = 'EGRESADO'
UNION ALL
SELECT
  'Pacientes TRASLADADO totales',
  COUNT(*)::text
FROM pacientes
WHERE estado = 'TRASLADADO'
UNION ALL
SELECT
  'Eventos activos (no cancelados)',
  COUNT(*)::text
FROM evento_apoyo_paciente
WHERE estado <> 'Cancelada';

-- 2) ACTIVOS POR SERVICIO
SELECT
  s.id        AS servicio_id,
  s.codigo    AS servicio_codigo,
  s.nombre    AS servicio_nombre,
  COUNT(p.id) AS pacientes_activos
FROM servicios s
LEFT JOIN subservicios sub ON sub.servicio_id = s.id
LEFT JOIN camas c          ON c.subservicio_id = sub.id
LEFT JOIN pacientes p      ON p.cama_id = c.id AND p.estado = 'ACTIVO'
GROUP BY s.id, s.codigo, s.nombre
ORDER BY s.id;

-- 3) HISTOGRAMA POR MES DE INGRESO (solo ACTIVO)
SELECT
  TO_CHAR(fecha_ingreso, 'YYYY-MM') AS anio_mes,
  COUNT(*)                          AS pacientes,
  MIN(fecha_ingreso)                AS primero,
  MAX(fecha_ingreso)                AS ultimo
FROM pacientes
WHERE estado = 'ACTIVO'
GROUP BY TO_CHAR(fecha_ingreso, 'YYYY-MM')
ORDER BY anio_mes;

-- 4) NOMBRES SOSPECHOSOS (ajusta los patrones segun tus pruebas tipicas)
SELECT
  p.id AS paciente_id,
  p.nombre_paciente,
  p.fecha_ingreso,
  p.dias_estancia,
  c.numero_cama,
  s.nombre AS servicio
FROM pacientes p
LEFT JOIN camas c          ON c.id = p.cama_id
LEFT JOIN subservicios sub ON sub.id = c.subservicio_id
LEFT JOIN servicios s      ON s.id = sub.servicio_id
WHERE p.estado = 'ACTIVO'
  AND (
       UPPER(p.nombre_paciente) LIKE '%PRUEBA%'
    OR UPPER(p.nombre_paciente) LIKE '%TEST%'
    OR UPPER(p.nombre_paciente) LIKE '%XXX%'
    OR UPPER(p.nombre_paciente) LIKE '%DEMO%'
    OR UPPER(p.nombre_paciente) LIKE '%EJEMPLO%'
    OR UPPER(p.nombre_paciente) LIKE '%FAKE%'
    OR UPPER(p.nombre_paciente) LIKE '%DUMMY%'
    OR UPPER(p.nombre_paciente) LIKE 'PACIENTE %'
    OR UPPER(p.nombre_paciente) ~ '^[A-Z]{1,3}$'              -- iniciales sueltas
    OR UPPER(p.nombre_paciente) ~ '^(AAAA|BBBB|ZZZZ)'         -- placeholder con letras repetidas
    OR length(trim(p.nombre_paciente)) < 5                    -- nombres demasiado cortos
  )
ORDER BY p.fecha_ingreso;

-- 5) PACIENTES CON dias_estancia MAYOR A 30 (posiblemente quedados)
SELECT
  p.id AS paciente_id,
  p.nombre_paciente,
  p.fecha_ingreso,
  p.dias_estancia,
  c.numero_cama,
  s.nombre AS servicio
FROM pacientes p
LEFT JOIN camas c          ON c.id = p.cama_id
LEFT JOIN subservicios sub ON sub.id = c.subservicio_id
LEFT JOIN servicios s      ON s.id = sub.servicio_id
WHERE p.estado = 'ACTIVO'
  AND p.dias_estancia > 30
ORDER BY p.dias_estancia DESC;
