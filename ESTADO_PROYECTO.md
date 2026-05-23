# Estado del Proyecto — Censo Salvatierra
**Última actualización:** 2026-05-23
**Próximo paso:** esperar respuestas del Google Form de alta de colaboradores

---

## Resumen ejecutivo

Sistema en estado **listo para producción** con datos de prueba limpios. Falta solo cargar los usuarios cuando llenen el formulario.

Form de alta activo: https://forms.gle/HrHZYuFYwuPuvb3t7

---

## Lo que está hecho (16 tareas completadas)

### Fase A — modelo de eventos clínicos
- **Tabla** `evento_apoyo_paciente` con 13 tipos y 5 estados (Solicitada/Pendiente/Realizada/Retirada/Cancelada)
- **Trigger** `fn_evento_productividad` (cuenta +1 en `productividad_capturas` al pasar a Realizada)
- **Trigger** `fn_continuidad_turno_actual` + **pg_cron** (recompute al inicio de cada turno: 08:01 / 14:01 / 20:01 hora Mazatlán)
- **8 indicadores nuevos** en `catalogo_indicadores_productividad`: K06, K07, OX1, AV1, SD1, DP1, CUR1, PRC1

### Fase B+C — UI nueva basada en eventos
- Hook `useEventosApoyo` (CRUD + optimistic updates)
- `EventCard` (estado dropdown + fechas híbridas botón/lápiz + observaciones)
- `EventCardGroup` (lista de cards por tipo + selector "+ Nuevo evento")
- `VistaFormatoControl` reescrita: chips y fechas legacy → tarjetas evento
- `VistaImpresionControl` lee desde `evento_apoyo_paciente`

### Tablero Maestro v2
- Vistas **Día / Semana / Mes**
- Día/Semana: desglose por turno **M/V/N + Total**
- Mes mantiene formato original + botón Exportar Excel+PDF
- Performance: queries en paralelo (Promise.all) + lookup Map O(1)

### Roles y seguridad
- `Rol`: jefe / subjefe / supervisor / gestor / enfermera
- `Turno`: M / V / N / JORNADA
- **RLS aplicado** en 8 tablas (pacientes, evento_apoyo_paciente, dietas, recetario, formato_control_paciente, productividad_capturas, historicos_egresos, perfiles)
- Frontend respeta scope:
  - **Tablero Maestro**: tabs Semana/Mes solo para `jefe`/`subjefe`. Gestor solo ve su servicio.
  - **Dashboard**: gestor/enfermera solo ven su servicio asignado.

### Limpieza y consistencia
- 22 columnas legacy borradas de `formato_control_paciente` (queda en 11 columnas)
- `v_control_servicio` recreada limpia
- Censo a cero: 0 pacientes, 0 eventos, 0 dietas, 0 recetas, 0 productividad
- Catálogos preservados (81 indicadores, 6 motivos egreso, 7 perfiles, 208 camas)

### Mobile / Tablet
- PWA instalable (manifest + service worker activos)
- Media queries globales en `src/index.css`
- Touch targets mínimo 32-36px
- Headers con flex-wrap para stack vertical en pantallas chicas

### Polish UI
- Colores `AUTO_EVENTO` (lavanda) y `AUTO_CONTINUIDAD` (durazno) en exports + UI
- "Migrado de..." escondido como ícono pequeño
- `VM` removido del dropdown de Oxigenoterapia

---

## Archivos clave

### SQL migrations (en orden, aplicados)
```
supabase/04_eventos_apoyo_paciente.sql       Tabla + auditoría + RLS base
supabase/05_trigger_productividad_eventos.sql Trigger evento → productividad
supabase/06_continuidad_productividad.sql    Trigger + función continuidad
supabase/06b_cron_continuidad.sql            pg_cron 3 jobs por turno
supabase/07_ampliar_tipos_y_catalogo.sql     6 indicadores nuevos
supabase/08_origen_productividad.sql         CHECK origen ampliado
supabase/10_aggregates_cur_prc.sql           CUR1 + PRC1
supabase/11_migrar_formato_control_a_eventos.sql  Datos legacy → eventos
supabase/12_limpiar_oxigeno_vm.sql           VM fuera de oxigeno
supabase/13_limpiar_datos_prueba.sql         96 pacientes prueba borrados
supabase/14_drop_columnas_legacy.sql         22 columnas borradas + view
supabase/15_reset_total.sql                  Reset histórico completo
supabase/16_perfiles_rol_y_servicio.sql      Rol 'jefe' + FK servicio_id
supabase/17_helpers_rls.sql                  Funciones de scope
supabase/18_aplicar_rls.sql                  RLS policies por rol
```

### SQL pendientes
```
supabase/19_alta_colaboradores.sql           Por generar cuando lleguen los datos del Form
```

### Tests
```
supabase/tests/test_fase_a.sql               Validación 5/5 pasada
supabase/tests/diagnostico_pacientes.sql     Auditoría read-only
```

### Frontend nuevo / modificado
```
src/hooks/useEventosApoyo.ts                 (nuevo)
src/pages/components/EventCard.tsx           (nuevo)
src/pages/components/EventCardGroup.tsx      (nuevo)
src/pages/components/VistaFormatoControl.tsx (reescrita)
src/pages/components/VistaProductividad.tsx  (colores ampliados)
src/pages/VistaImpresionControl.tsx          (lee de eventos)
src/pages/TableroMaestro.tsx                 (Día/Semana/Mes + roles + perf)
src/pages/Dashboard.tsx                      (filtro por scope)
src/types/index.ts                           (Rol + Turno ampliados + helpers)
src/utils/exportarProductividad.ts           (colores AUTO_EVENTO/CONTINUIDAD)
src/index.css                                (responsive + touch)
src/vite-env.d.ts                            (nuevo, fix import.meta.env)
```

---

## Para retomar cuando lleguen los datos del Form

1. **Descarga las respuestas del Form** como CSV desde Google Sheets
2. Pégame el contenido (o sube el CSV)
3. Yo genero `supabase/19_alta_colaboradores.sql` con:
   - INSERTs a `auth.users` (Supabase Admin API) — o invitaciones por email
   - INSERTs a `perfiles` con rol, servicio_id, turno
4. Aplicas la migración
5. Cada colaborador recibe invitación con link para crear contraseña
6. RLS ya está activa: cada quien verá solo lo que le corresponde según su rol

---

## Comandos útiles

### Levantar dev server
```bash
cd "/Users/stavros/Desktop/Proyecto _censo/censo-salvatierra"
npm run dev
# Verás: Network: http://192.168.X.X:5173  ← úsalo en móvil/tablet en la misma WiFi
```

### Verificar TypeScript
```bash
npx tsc --noEmit
# Debe regresar sin output (cero errores)
```

### Build de producción
```bash
npx vite build
# Genera dist/ con PWA precacheable
```

### Verificar estado de la DB (en Supabase SQL Editor)
```sql
SELECT
  (SELECT COUNT(*) FROM pacientes)                                 AS pacientes,
  (SELECT COUNT(*) FROM evento_apoyo_paciente)                     AS eventos,
  (SELECT COUNT(*) FROM productividad_capturas)                    AS productividad,
  (SELECT COUNT(*) FROM perfiles)                                   AS usuarios,
  (SELECT COUNT(*) FROM catalogo_indicadores_productividad)        AS indicadores;
-- Esperado al regresar: pacientes=0, eventos=0, productividad=0, usuarios>=7, indicadores=81
```

---

## Pendientes técnicos no urgentes (para más adelante)

- [ ] **Git init** del repo (no hay control de versiones aún)
- [ ] Agregar `total_auto_evento` y `total_auto_continuidad` a la vista `v_productividad_export_mensual` para que el Excel METADATA muestre los 5 orígenes
- [ ] Validar el flujo de archivado en `historicos_egresos` cuando egrese el primer paciente real
- [ ] Considerar code-splitting para reducir el bundle (warning de 1.4 MB en `vite build`)
- [ ] Test E2E del flujo completo: ingreso → eventos → egreso → tablero

---

## Notas de operación

- **Hora local**: el sistema usa `America/Mazatlan` consistentemente (triggers, cron, helpers de fecha)
- **Turnos institucionales BCS**: M = 08:00-14:00, V = 14:01-20:00, N = 20:01-07:59
- **CLUES**: BSIMB000672 (Hospital General "Juan María de Salvatierra")
- **Servicios**: URG, TOC, PSQ, UCI, CIN, PED, HH1, HH2, HM, ONC
