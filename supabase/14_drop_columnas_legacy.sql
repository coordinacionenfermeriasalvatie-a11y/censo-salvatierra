-- ============================================================
-- DROP de columnas legacy en formato_control_paciente
--
-- Estas columnas se migraron a evento_apoyo_paciente en Fase B+C.
-- La UI nueva (VistaFormatoControl.tsx, VistaImpresionControl.tsx)
-- ya NO las lee ni las escribe.
--
-- Columnas QUE QUEDAN (no se borran):
--   riesgo_upp, riesgo_caidas, causa_no_ocupacion, traslado, observaciones,
--   capturado_por, capturado_en, paciente_id, id (sistema), sellado, etc.
--
-- USA CASCADE: si alguna vista referencia estas columnas se cae con ellas.
-- Por eso primero hay un BLOQUE DE DIAGNOSTICO que lista las dependencias.
--
-- DRY-RUN POR DEFECTO. Cambia ROLLBACK por COMMIT al final para aplicar.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) DIAGNOSTICO: qué vistas/funciones dependen de las columnas a borrar
-- ============================================================

SELECT
  v.relname  AS objeto_dependiente,
  v.relkind  AS tipo,     -- 'v'=vista, 'm'=materialized view
  CASE v.relkind
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized view'
    ELSE v.relkind::text
  END AS tipo_legible,
  string_agg(DISTINCT a.attname, ', ' ORDER BY a.attname) AS columnas_que_usa
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class v ON v.oid = r.ev_class
JOIN pg_class t ON t.oid = d.refobjid AND t.relname = 'formato_control_paciente'
JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
WHERE d.deptype = 'n'
  AND v.relkind IN ('v','m')
  AND v.relname <> 'formato_control_paciente'
  AND a.attname IN (
    'ventilacion_mecanica','cvp_instalacion','cvc_instalacion','cateter_umbilical',
    'lisis_lavado_cateter','curacion_cvp','curacion_cvc','refijacion_cvc',
    'sonda_gastrica','sonda_pleurostomia','cateter_urinario',
    'estomas','heridas','suturas_realizadas',
    'precauciones_aislamiento',
    'oxigeno','interconsulta','glucemia_capilar',
    'hemoderivados','laboratorios','estudios_gabinete',
    'higiene_paciente'
  )
GROUP BY v.relname, v.relkind
ORDER BY v.relname;

-- ============================================================
-- 2) DROP de columnas legacy (CASCADE para limpiar vistas dependientes)
-- ============================================================
-- 22 columnas a borrar. Cada una con IF EXISTS por seguridad si el nombre
-- variara entre instalaciones.

ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS ventilacion_mecanica       CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS cvp_instalacion            CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS cvc_instalacion            CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS cateter_umbilical          CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS lisis_lavado_cateter       CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS curacion_cvp               CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS curacion_cvc               CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS refijacion_cvc             CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS sonda_gastrica             CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS sonda_pleurostomia         CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS cateter_urinario           CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS estomas                    CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS heridas                    CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS suturas_realizadas         CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS precauciones_aislamiento   CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS oxigeno                    CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS interconsulta              CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS glucemia_capilar           CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS hemoderivados              CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS laboratorios               CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS estudios_gabinete          CASCADE;
ALTER TABLE formato_control_paciente DROP COLUMN IF EXISTS higiene_paciente           CASCADE;

-- ============================================================
-- 3) RECREAR v_control_servicio
--
-- El CASCADE de arriba dropeo la vista. La recreamos aqui con solo
-- las columnas que la UI nueva necesita.
-- ============================================================
CREATE OR REPLACE VIEW v_control_servicio AS
SELECT
  p.id                       AS paciente_id,
  sub.servicio_id            AS servicio_id,
  sub.nombre                 AS subservicio,
  c.numero_cama              AS numero_cama,
  p.nombre_paciente          AS nombre_paciente,
  p.edad                     AS edad,
  p.genero                   AS genero,
  p.nss_curp                 AS nss_curp,
  p.diagnostico_ingreso      AS diagnostico_ingreso,
  fc.riesgo_upp              AS riesgo_upp,
  fc.riesgo_caidas           AS riesgo_caidas,
  fc.causa_no_ocupacion      AS causa_no_ocupacion,
  fc.traslado                AS traslado,
  fc.observaciones           AS observaciones
FROM pacientes p
JOIN camas c              ON c.id   = p.cama_id
JOIN subservicios sub     ON sub.id = c.subservicio_id
LEFT JOIN formato_control_paciente fc ON fc.paciente_id = p.id
WHERE p.estado = 'ACTIVO';

COMMENT ON VIEW v_control_servicio IS
  'Pacientes ACTIVO con datos de formato_control_paciente (solo columnas legacy preservadas en Fase B+C). Chips y fechas clinicas viven en evento_apoyo_paciente, no aqui.';

-- ============================================================
-- 4) POST-CHECK: estructura final de la tabla
-- ============================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'formato_control_paciente'
ORDER BY ordinal_position;

-- ============================================================
-- 5) POST-CHECK: estructura final de v_control_servicio
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'v_control_servicio'
ORDER BY ordinal_position;

-- ============================================================
-- ⚠️ DRY-RUN: NO se aplican cambios.
-- Verifica que:
--   * Resultado #3 muestre solo 11 columnas en formato_control_paciente
--   * Resultado #4 muestre las 14 columnas de v_control_servicio
-- Cuando todo cuadre, cambia ROLLBACK por COMMIT y vuelve a correr.
-- ============================================================
ROLLBACK;
-- COMMIT;
