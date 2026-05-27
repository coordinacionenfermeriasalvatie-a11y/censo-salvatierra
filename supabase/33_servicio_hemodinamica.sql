-- ============================================================
-- Migración 33: Servicio HEMODINAMICA
-- ============================================================
-- 1 camilla no censable. Mismo patrón que URPA y HEMODIALISIS.
-- Sala de procedimientos (cateterismo cardíaco, angiografía, etc.).
-- ============================================================

INSERT INTO servicios (codigo, nombre, total_camas, orden)
VALUES ('HDN', 'HEMODINAMICA', 0, 13)
ON CONFLICT (codigo) DO UPDATE SET nombre=EXCLUDED.nombre, total_camas=EXCLUDED.total_camas, orden=EXCLUDED.orden;

INSERT INTO subservicios (servicio_id, nombre, orden)
SELECT id, 'HEMODINAMICA', 1 FROM servicios WHERE codigo='HDN'
ON CONFLICT DO NOTHING;

INSERT INTO camas (subservicio_id, numero_cama, activa, es_censable)
SELECT sub.id, '1', TRUE, FALSE
FROM subservicios sub
JOIN servicios s ON s.id=sub.servicio_id
WHERE s.codigo='HDN' AND sub.nombre='HEMODINAMICA'
ON CONFLICT DO NOTHING;

SELECT s.codigo, s.nombre, COUNT(c.id) AS camillas
FROM servicios s
JOIN subservicios sub ON sub.servicio_id=s.id
JOIN camas c ON c.subservicio_id=sub.id
WHERE s.codigo='HDN' GROUP BY s.codigo, s.nombre;
