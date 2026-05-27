-- ============================================================
-- Migración 37: ordenar camas con sufijo junto a su número base
-- ============================================================
-- Antes: '24' → '0024', '24B' → '24B' → quedaba al final por ASCII.
-- Ahora: '24B' → '0024B' → queda inmediatamente después de '24'.
-- Esto agrupa visualmente las camas '24, 24A, 24B' en el censo.
-- ============================================================

DROP VIEW IF EXISTS v_camas_estado;

CREATE VIEW v_camas_estado AS
SELECT
  c.id                        AS cama_id,
  s.id                        AS servicio_id,
  s.nombre                    AS servicio,
  sub.id                      AS subservicio_id,
  sub.nombre                  AS subservicio,
  sub.orden                   AS subservicio_orden,
  c.numero_cama,
  CASE
    -- Solo dígitos: pad a 4
    WHEN c.numero_cama ~ '^[0-9]+$' THEN
      lpad(c.numero_cama, 4, '0')
    -- Dígitos + sufijo alfa (24A, 24B): pad solo la parte numérica
    -- + sufijo en mayúsculas, así '24B' → '0024B' (sortea después de '0024')
    WHEN c.numero_cama ~ '^[0-9]+[A-Za-z]+$' THEN
      lpad(substring(c.numero_cama from '^[0-9]+'), 4, '0')
      || upper(substring(c.numero_cama from '[A-Za-z]+$'))
    -- Cualquier otro caso (prefijos no numéricos): texto tal cual
    ELSE c.numero_cama
  END                         AS numero_cama_sort,
  COALESCE(c.es_censable, TRUE) AS es_censable,
  p.id                        AS paciente_id,
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
  c.bloqueada                 AS cama_bloqueada,
  c.causa_no_ocupacion        AS cama_causa_no_ocupacion,
  c.nota_no_ocupacion         AS cama_nota_no_ocupacion,
  c.bloqueada_desde           AS cama_bloqueada_desde,
  CASE
    WHEN p.id IS NOT NULL THEN 'OCUPADA'::text
    WHEN c.bloqueada           THEN 'NO_OCUPABLE'::text
    ELSE 'DISPONIBLE'::text
  END                         AS estado_cama
FROM camas c
JOIN subservicios sub ON sub.id = c.subservicio_id
JOIN servicios s    ON s.id    = sub.servicio_id
LEFT JOIN pacientes p ON p.cama_id = c.id AND p.estado = 'ACTIVO'
LEFT JOIN formato_control_paciente fc ON fc.paciente_id = p.id
WHERE c.activa = TRUE;

COMMENT ON VIEW v_camas_estado IS
  'Camas + paciente activo. numero_cama_sort agrupa camas con sufijo (24A, 24B) junto a su número base (24).';

-- POST-CHECK para HH2: deben aparecer 24 y 24B juntas
SELECT numero_cama, numero_cama_sort
FROM v_camas_estado
WHERE servicio_id=8
  AND numero_cama ~ '^2[0-9]'
ORDER BY numero_cama_sort;
