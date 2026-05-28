-- ============================================================
-- Migración 53: Separar URGENCIAS PEDIÁTRICAS de URGENCIAS
-- ============================================================
-- Hasta hoy URGENCIAS PEDIÁTRICAS era subservicio de URGENCIAS (id=1).
-- Ahora se convierte en su propio servicio con código UPED.
--
-- Estado previo:
--   URG (id=1, 25 camas total) →
--     ANEXOS (7), CAMILLAS (10 no censables), CURACIONES (0),
--     OBSERVACIÓN (11), SALA DE CHOQUE (2), SILLAS (8 no censables),
--     URGENCIAS PEDIÁTRICAS (5 censables)  ← este sale
--
-- Estado posterior:
--   URG  (id=1, 20 camas total): los 6 subservicios restantes
--   UPED (id nuevo, 5 camas total): URGENCIAS PEDIÁTRICAS
--
-- Como hoy hay 0 pacientes activos en UPED, la migración es segura.
-- Las camas conservan su id (sin re-crear), por lo que productividad
-- histórica capturada bajo URG queda como referencia histórica.
-- ============================================================

BEGIN;

-- 1) Hacer espacio en orden y crear el nuevo servicio
--    UPED se coloca como #2, justo después de URG. Los demás se desplazan +1.
UPDATE servicios SET orden = orden + 1 WHERE orden >= 2;

INSERT INTO servicios (codigo, nombre, total_camas, orden)
VALUES ('UPED', 'URGENCIAS PEDIÁTRICAS', 5, 2)
ON CONFLICT (codigo) DO NOTHING;

-- 2) Mover el subservicio URGENCIAS PEDIÁTRICAS al nuevo servicio
UPDATE subservicios
   SET servicio_id = (SELECT id FROM servicios WHERE codigo = 'UPED')
 WHERE id = 5  -- URGENCIAS PEDIÁTRICAS
   AND nombre = 'URGENCIAS PEDIÁTRICAS';

-- 3) Ajustar total_camas de URG (restar 5 censables que se llevó UPED)
UPDATE servicios
   SET total_camas = total_camas - 5
 WHERE codigo = 'URG';

-- 4) POST-CHECK
SELECT s.id, s.codigo, s.nombre, s.total_camas,
       COUNT(sub.id) AS subservicios,
       SUM((SELECT COUNT(*) FROM camas c WHERE c.subservicio_id = sub.id)) AS camas_reales
FROM servicios s
LEFT JOIN subservicios sub ON sub.servicio_id = s.id
WHERE s.codigo IN ('URG','UPED')
GROUP BY s.id, s.codigo, s.nombre, s.total_camas
ORDER BY s.codigo;

COMMIT;
