-- ============================================================
-- Migración 42: subservicios con nombre completo + rename PED
-- ============================================================
-- 1) Agrega columna nombre_completo (la abreviatura sigue en `nombre`,
--    que es lo que la UI muestra en grande).
-- 2) Renombra los 4 subservicios críticos de PEDIATRÍA y les pone su
--    nombre completo:
--      - UCIP → UTIP  (Unidad de Terapia Intensiva Pediátrica)
--      - UCIN         (Unidad de Cuidados Intensivos Neonatales)
--      - UTIP → UTIN  (Unidad de Terapia Intermedia Neonatal)
--      - CRECIMIENTO Y DESARROLLO → CYD (Crecimiento y Desarrollo)
--    ESCOLARES y LACTANTES se quedan como están.
-- 3) Expone subservicio_completo en v_camas_estado para que la UI
--    pueda mostrarlo bajo la abreviatura.
-- ============================================================

ALTER TABLE subservicios ADD COLUMN IF NOT EXISTS nombre_completo TEXT;

-- IMPORTANTE: el unique (servicio_id, nombre) impide que dos subservicios
-- del mismo servicio compartan nombre. Por eso renombramos primero el
-- sub_id=13 (UTIP → UTIN) y después el sub_id=11 (UCIP → UTIP), así no
-- chocan en el paso intermedio.
UPDATE subservicios
   SET nombre='UTIN',
       nombre_completo='Unidad de Terapia Intermedia Neonatal'
 WHERE id = 13;

UPDATE subservicios
   SET nombre='UTIP',
       nombre_completo='Unidad de Terapia Intensiva Pediátrica'
 WHERE id = 11;

UPDATE subservicios
   SET nombre_completo='Unidad de Cuidados Intensivos Neonatales'
 WHERE id = 12;

UPDATE subservicios
   SET nombre='CYD',
       nombre_completo='Crecimiento y Desarrollo'
 WHERE id = 14;

-- Recrear v_camas_estado APPENDING subservicio_completo al final
-- (CREATE OR REPLACE VIEW solo permite agregar columnas al final).
CREATE OR REPLACE VIEW public.v_camas_estado AS
SELECT
  c.id AS cama_id,
  s.id AS servicio_id,
  s.nombre AS servicio,
  sub.id AS subservicio_id,
  sub.nombre AS subservicio,
  sub.orden AS subservicio_orden,
  c.numero_cama,
  CASE
    WHEN c.numero_cama ~ '^[0-9]+$'        THEN lpad(c.numero_cama, 4, '0')
    WHEN c.numero_cama ~ '^[0-9]+[A-Za-z]+$' THEN lpad(substring(c.numero_cama, '^[0-9]+'), 4, '0') || upper(substring(c.numero_cama, '[A-Za-z]+$'))
    ELSE c.numero_cama
  END AS numero_cama_sort,
  COALESCE(c.es_censable, TRUE) AS es_censable,
  p.id AS paciente_id,
  p.nombre_paciente,
  p.edad,
  p.genero,
  p.fecha_ingreso,
  p.hora_ingreso,
  p.diagnostico_ingreso,
  p.grupo_sanguineo,
  p.alergias,
  fc.riesgo_caidas,
  fc.riesgo_upp,
  p.estado,
  c.bloqueada AS cama_bloqueada,
  c.causa_no_ocupacion AS cama_causa_no_ocupacion,
  c.nota_no_ocupacion AS cama_nota_no_ocupacion,
  c.bloqueada_desde AS cama_bloqueada_desde,
  CASE
    WHEN p.id IS NOT NULL THEN 'OCUPADA'
    WHEN c.bloqueada THEN 'NO_OCUPABLE'
    ELSE 'DISPONIBLE'
  END AS estado_cama,
  -- NUEVO: nombre completo del subservicio (puede ser NULL)
  sub.nombre_completo AS subservicio_completo
FROM camas c
JOIN subservicios sub ON sub.id = c.subservicio_id
JOIN servicios s ON s.id = sub.servicio_id
LEFT JOIN pacientes p ON p.cama_id = c.id AND p.estado = 'ACTIVO'
LEFT JOIN formato_control_paciente fc ON fc.paciente_id = p.id
WHERE c.activa = TRUE;
