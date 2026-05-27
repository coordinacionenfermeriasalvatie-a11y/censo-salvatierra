-- ============================================================
-- Migración 29: Servicio URPA (Unidad de Recuperación Post-Anestésica)
-- ============================================================
-- 10 camillas (todas NO CENSABLES) → no afectan el % de ocupación
-- del Tablero Maestro ni los KPIs de censables.
-- Tendrá sus 5 pestañas (Censo, Dietas, Recetario, Control,
-- Productividad) igual que cualquier otro servicio, pero como
-- total_camas=0 el dashboard no la sumará a totales censables.
-- Productividad propia (separada de Urgencias) porque vive en su
-- propio servicio_id.
-- ============================================================

-- 1) Servicio URPA (orden 11, después de Oncología que es 10)
INSERT INTO servicios (codigo, nombre, total_camas, orden)
VALUES ('URPA', 'URPA', 0, 11)
ON CONFLICT (codigo) DO UPDATE SET nombre=EXCLUDED.nombre, total_camas=EXCLUDED.total_camas, orden=EXCLUDED.orden
RETURNING id, codigo, nombre, total_camas, orden;

-- 2) Subservicio único "URPA" dentro del servicio
INSERT INTO subservicios (servicio_id, nombre, orden)
SELECT id, 'URPA', 1 FROM servicios WHERE codigo='URPA'
ON CONFLICT DO NOTHING
RETURNING id;

-- 3) 10 camillas (es_censable=FALSE)
INSERT INTO camas (subservicio_id, numero_cama, activa, es_censable)
SELECT sub.id, gs::text, TRUE, FALSE
FROM subservicios sub
JOIN servicios s ON s.id=sub.servicio_id
CROSS JOIN generate_series(1, 10) gs
WHERE s.codigo='URPA' AND sub.nombre='URPA'
ON CONFLICT DO NOTHING;

-- 4) POST-CHECK
SELECT s.codigo, s.nombre, s.total_camas AS censables,
       COUNT(c.id) FILTER (WHERE NOT c.es_censable AND c.activa) AS camillas,
       COUNT(c.id) AS total_camas_fisicas
FROM servicios s
LEFT JOIN subservicios sub ON sub.servicio_id=s.id
LEFT JOIN camas c ON c.subservicio_id=sub.id
WHERE s.codigo='URPA'
GROUP BY s.codigo, s.nombre, s.total_camas;
