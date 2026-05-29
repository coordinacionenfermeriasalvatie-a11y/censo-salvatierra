-- ============================================================
-- Migración 57: HOSP-1 (Clínica de Heridas) deja de ser censable
-- ============================================================
-- La cama HOSP-1 de CDH se creó como censable (migración 39), pero
-- en realidad es una camilla de hospitalización temporal que NO debe
-- contar en el indicador de ocupación, igual que AMB-1 y AMB-2.
--
-- Cambios:
--   1) camas.es_censable = FALSE para HOSP-1 de CDH.
--   2) servicios.total_camas = 0 para CDH (ya no queda ninguna censable).
--
-- Idempotente: se puede correr varias veces sin efectos secundarios.
-- ============================================================

-- 1) HOSP-1 → camilla (no censable)
UPDATE camas
   SET es_censable = FALSE
 WHERE numero_cama = 'HOSP-1'
   AND subservicio_id IN (
     SELECT sub.id
     FROM subservicios sub
     JOIN servicios s ON s.id = sub.servicio_id
     WHERE s.codigo = 'CDH'
   );

-- 2) CDH ya no tiene camas censables → total_camas = 0
UPDATE servicios
   SET total_camas = 0
 WHERE codigo = 'CDH';

-- 3) POST-CHECK: las 3 camas de CDH deben quedar es_censable = FALSE
SELECT s.codigo, s.nombre, s.total_camas, c.numero_cama, c.es_censable
FROM servicios s
JOIN subservicios sub ON sub.servicio_id = s.id
JOIN camas c ON c.subservicio_id = sub.id
WHERE s.codigo = 'CDH'
ORDER BY c.es_censable, c.numero_cama;
