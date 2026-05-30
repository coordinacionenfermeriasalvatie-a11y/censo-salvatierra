-- ============================================================
-- 71_historico_recetas_surtidas.sql
-- "Recetas surtidas" = recetas_controladas canjeadas (estado_aprobacion
-- = 'canjeada'). La Bitacora de Psicotropicos necesita un HISTORICO de
-- surtidas por rango de fechas, filtrable por supervision y medicamento.
--
-- La vista v_bitacora_psicotropicos_detalle (migracion 52) ya lista los
-- vales del dia, pero NO expone la supervision (numero), el servicio_id
-- ni el grupo de control, asi que el frontend no puede filtrar por
-- supervision. Aqui la recreamos AGREGANDO al final tres columnas:
--   - supervision        (derivada de servicios.supervision: 1/2/NULL)
--   - servicio_id
--   - medicamento_grupo
-- CREATE OR REPLACE VIEW solo permite APPEND al final, por eso se
-- reproduce la lista de columnas existente y se agregan las tres nuevas.
--
-- El frontend filtra: estado_aprobacion='canjeada' + rango de fecha_dia
-- (fecha_dia = fecha de canje en hora Mazatlan) + supervision + nombre
-- de medicamento. El "Detalle de vales del dia" actual sigue igual
-- (solo lee mas columnas; las ignora).
--
-- ASCII puro y lineas cortas (evita truncado al pegar en el SQL Editor).
-- Idempotente.
-- ============================================================

CREATE OR REPLACE VIEW v_bitacora_psicotropicos_detalle AS
SELECT
  rc.id AS receta_id,
  rc.folio,
  rc.folio_salida,
  rc.creado_en,
  rc.canjeado_en,
  (COALESCE(rc.canjeado_en, rc.creado_en) AT TIME ZONE 'America/Mazatlan')::date AS fecha_dia,
  fn_turno_de_fecha(COALESCE(rc.canjeado_en, rc.creado_en)) AS turno,
  rc.paciente_cama,
  rc.paciente_nombre,
  rc.paciente_genero,
  rc.paciente_nss_curp AS no_expediente,
  rc.paciente_diagnostico,
  rc.paciente_subservicio,
  s.codigo AS servicio_codigo,
  s.nombre AS servicio_nombre,
  rc.medicamento_nombre,
  rc.cantidad_numero,
  rc.cantidad_letra,
  rc.medico_nombre,
  rc.medico_cedula,
  rc.enfermera_nombre AS enfermero_solicita,
  rc.aprobado_nombre AS supervisora,
  rc.observaciones,
  rc.estado_aprobacion,
  -- NUEVO (append-only):
  s.supervision        AS supervision,
  rc.servicio_id       AS servicio_id,
  rc.medicamento_grupo AS medicamento_grupo
FROM recetas_controladas rc
LEFT JOIN servicios s ON s.id = rc.servicio_id
WHERE rc.estado_aprobacion IN ('aprobada','canjeada');

COMMENT ON VIEW v_bitacora_psicotropicos_detalle IS
  'Detalle de vales aprobados/canjeados. Incluye supervision (de servicios), servicio_id y medicamento_grupo para el historico de recetas surtidas filtrable por supervision.';

GRANT SELECT ON v_bitacora_psicotropicos_detalle TO authenticated;

-- POST-CHECK: surtidas (canjeadas) recientes con su supervision
SELECT fecha_dia, supervision, folio, folio_salida, medicamento_nombre,
       cantidad_numero, servicio_codigo, estado_aprobacion
FROM v_bitacora_psicotropicos_detalle
WHERE estado_aprobacion = 'canjeada'
ORDER BY canjeado_en DESC NULLS LAST
LIMIT 20;
