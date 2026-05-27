-- ============================================================
-- Migración 30: Servicio HEMODIALISIS
-- ============================================================
-- 3 camillas (todas NO CENSABLES). Mismo patrón que URPA: tiene sus
-- 5 pestañas y productividad propia, pero no aporta a censables del
-- Tablero Maestro.
-- ============================================================

INSERT INTO servicios (codigo, nombre, total_camas, orden)
VALUES ('HDL', 'HEMODIALISIS', 0, 12)
ON CONFLICT (codigo) DO UPDATE SET nombre=EXCLUDED.nombre, total_camas=EXCLUDED.total_camas, orden=EXCLUDED.orden;

INSERT INTO subservicios (servicio_id, nombre, orden)
SELECT id, 'HEMODIALISIS', 1 FROM servicios WHERE codigo='HDL'
ON CONFLICT DO NOTHING;

INSERT INTO camas (subservicio_id, numero_cama, activa, es_censable)
SELECT sub.id, gs::text, TRUE, FALSE
FROM subservicios sub
JOIN servicios s ON s.id=sub.servicio_id
CROSS JOIN generate_series(1, 3) gs
WHERE s.codigo='HDL' AND sub.nombre='HEMODIALISIS'
ON CONFLICT DO NOTHING;

SELECT s.codigo, s.nombre, COUNT(c.id) AS camillas
FROM servicios s
JOIN subservicios sub ON sub.servicio_id=s.id
JOIN camas c ON c.subservicio_id=sub.id
WHERE s.codigo='HDL'
GROUP BY s.codigo, s.nombre;
