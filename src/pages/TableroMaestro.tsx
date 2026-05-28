// src/pages/TableroMaestro.tsx
// BLOQUE 6 — Tablero Maestro (Jefe/Subjefe/Supervisor/Gestor según rol)
// Benemérito Hospital General con Especialidades del IMSS-Bienestar "Juan María de Salvatierra"
//
// Características:
//   - Selector de PERIODO: Día / Semana / Mes (Semana/Mes solo jefe/subjefe)
//   - Date picker para día/semana (semana = lunes-domingo de la fecha)
//   - Día y semana: desglose por turno M/V/N + Total
//   - Mes mantiene comportamiento original (usa vistas v_tablero_*)
//   - Performance: Promise.all en lugar de await secuencial
//   - Productividad lookup via Map (O(1) vs O(n) por celda)
//   - Gestor: scope automático a su servicio asignado
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
// exportarProductividadMensual se carga dinamicamente al hacer click en Exportar
// para evitar incluir exceljs (~600KB) en el bundle principal.
import {
  ROLES_VEN_TABLERO,
  ROLES_TABLERO_COMPLETO,
  esAdminGlobal,
  esJefeOAdmin,
} from '../types';

type Periodo = 'dia' | 'semana' | 'mes';
type Turno = 'M' | 'V' | 'N';

interface Ocupacion {
  servicio_id: number;
  codigo: string;
  servicio: string;
  orden: number;
  total_censables: number;
  ocupadas_censables: number;
  total_camillas: number;
  ocupadas_camillas: number;
  total_sillas: number;
  ocupadas_sillas: number;
  porcentaje_ocupacion: number;
}

interface Resumen {
  servicio_id: number;
  codigo: string;
  servicio: string;
  total_egresos: number;
  egresos_alta: number;
  egresos_traslado: number;
  egresos_defuncion: number;
  egresos_voluntario: number;
  egresos_fuga: number;
  promedio_dias_estancia: number;
  total_dias_paciente: number;
}

// Forma normalizada para celdas de productividad (cubre Día/Semana/Mes)
interface ProdCelda {
  servicio_id: number;
  servicio_codigo: string;
  indicador_codigo: string;
  indicador_nombre: string;
  indicador_orden: number;
  proceso: string;
  total: number;
  por_turno: { M: number; V: number; N: number };
}

const MESES_NOMBRE = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

// ============================================================
// HELPERS DE FECHA
// ============================================================
function fechaHoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Lun-Dom de la fecha dada. Devuelve {ini, fin} como YYYY-MM-DD.
function rangoSemanaLunDom(fechaISO: string): { ini: string; fin: string } {
  const d = new Date(fechaISO + 'T00:00:00');
  const dia = d.getDay(); // 0=Dom, 1=Lun, ..., 6=Sab
  const offsetLun = dia === 0 ? -6 : 1 - dia; // si es domingo, lunes fue hace 6
  const lun = new Date(d);
  lun.setDate(d.getDate() + offsetLun);
  const dom = new Date(lun);
  dom.setDate(lun.getDate() + 6);
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  return { ini: fmt(lun), fin: fmt(dom) };
}

function fmtFechaLarga(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${String(d.getDate()).padStart(2,'0')}-${MESES_NOMBRE[d.getMonth()]}-${d.getFullYear()}`;
}

// Genera arreglo de (anio, mes, dia) para cada día en el rango [ini..fin] inclusive.
function diasEnRango(ini: string, fin: string): { anio: number; mes: number; dia: number }[] {
  const out: { anio: number; mes: number; dia: number }[] = [];
  const a = new Date(ini + 'T00:00:00');
  const b = new Date(fin + 'T00:00:00');
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    out.push({ anio: d.getFullYear(), mes: d.getMonth()+1, dia: d.getDate() });
  }
  return out;
}

// ============================================================
// COMPONENTE
// ============================================================
export function TableroMaestro() {
  const navigate = useNavigate();
  const { perfil } = useAuth();

  const tieneAcceso          = perfil != null && ROLES_VEN_TABLERO.includes(perfil.rol);
  const tieneTableroCompleto = perfil != null && ROLES_TABLERO_COMPLETO.includes(perfil.rol);
  const esAdmin              = esAdminGlobal(perfil?.rol);
  // Si NO es admin global y tiene servicio asignado, todas las queries se
  // restringen a ese servicio (gestor de servicio).
  const servicioRestriccion: number | null = !esAdmin ? (perfil?.servicio_id ?? null) : null;

  // ---- Estado de período ----
  // Para roles sin tablero completo arrancamos en 'dia' (su única opción).
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const hoy = new Date();
  const [fechaSel, setFechaSel] = useState<string>(fechaHoyISO()); // YYYY-MM-DD
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes]   = useState(hoy.getMonth() + 1);

  // Si el rol no permite Semana/Mes, forzar Día.
  useEffect(() => {
    if (perfil && !tieneTableroCompleto && periodo !== 'dia') {
      setPeriodo('dia');
    }
  }, [perfil, tieneTableroCompleto, periodo]);

  // ---- Datos ----
  const [ocupacion, setOcupacion]       = useState<Ocupacion[]>([]);
  const [resumen, setResumen]           = useState<Resumen[]>([]);
  const [productividad, setProductividad] = useState<ProdCelda[]>([]);
  const [cargando, setCargando]         = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [exportando, setExportando]     = useState(false);
  // HDL: estadísticas de censo ERC histórico + sesiones de HD/DP.
  // Se cargan en paralelo al resto.
  const [hdlStats, setHdlStats] = useState<{ ercTotal: number; ercActivos: number; hdMes: number; dpMes: number }>({
    ercTotal: 0, ercActivos: 0, hdMes: 0, dpMes: 0,
  });

  // ---- Rango de fechas calculado ----
  const rangoFechas = useMemo(() => {
    if (periodo === 'mes') {
      const ultimoDia = new Date(anio, mes, 0).getDate();
      return {
        ini: `${anio}-${String(mes).padStart(2,'0')}-01`,
        fin: `${anio}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`,
      };
    }
    if (periodo === 'semana') {
      return rangoSemanaLunDom(fechaSel);
    }
    // dia
    return { ini: fechaSel, fin: fechaSel };
  }, [periodo, fechaSel, anio, mes]);

  // ============================================================
  // CARGA DE DATOS
  // ============================================================
  const cargar = useCallback(async () => {
    if (!tieneAcceso) { setCargando(false); return; }
    setCargando(true);
    setError(null);
    try {
      // 1) Ocupación (en vivo, sin filtro de fecha). Si el usuario tiene
      // servicio_id asignado (gestor), filtra a su servicio.
      let qOcup = supabase
        .from('v_tablero_ocupacion')
        .select('*')
        .order('orden');
      if (servicioRestriccion != null) {
        qOcup = qOcup.eq('servicio_id', servicioRestriccion);
      }
      const promOcup = qOcup;

      // 2) Resumen + productividad: rama por periodo
      // (tipamos como any porque el PostgrestFilterBuilder es thenable
      //  pero no es asignable a Promise<any> en estricto)
      let promResumen: any;
      let promProductividad: any;

      if (periodo === 'mes') {
        // Mes: usar vistas que ya tienes en Supabase
        let qRes = supabase
          .from('v_tablero_resumen')
          .select('*')
          .eq('anio', anio)
          .eq('mes', mes);
        if (servicioRestriccion != null) qRes = qRes.eq('servicio_id', servicioRestriccion);
        promResumen = qRes;

        let qProd = supabase
          .from('v_tablero_productividad')
          .select('*')
          .eq('anio', anio)
          .eq('mes', mes)
          .order('indicador_orden');
        if (servicioRestriccion != null) qProd = qProd.eq('servicio_id', servicioRestriccion);
        promProductividad = qProd;
      } else {
        // Día o semana: query directo a tablas base
        const { ini, fin } = rangoFechas;

        // Egresos en el rango
        promResumen = supabase
          .from('pacientes')
          .select(`
            id,
            dias_estancia,
            fecha_egreso,
            motivo_egreso_id,
            motivo:catalogo_motivos_egreso(nombre),
            cama:camas!inner(
              subservicio:subservicios!inner(
                servicio_id,
                servicio:servicios!inner(id, codigo, nombre, orden)
              )
            )
          `)
          .gte('fecha_egreso', ini)
          .lte('fecha_egreso', fin)
          .in('estado', ['EGRESADO','TRASLADADO']);

        // Productividad en el rango (filtramos en cliente por dia)
        // Usamos OR por cada (anio, mes, dia) del rango. Para 7 días = 7 OR clauses.
        const dias = diasEnRango(ini, fin);
        // Optimizacion: si todos los dias son del mismo (anio, mes) usamos .in('dia', ...)
        const todosMismoMes = dias.every(d => d.anio === dias[0].anio && d.mes === dias[0].mes);
        let q = supabase
          .from('productividad_capturas')
          .select(`
            servicio_id,
            indicador_id,
            anio, mes, dia, turno, valor,
            indicador:catalogo_indicadores_productividad!inner(codigo, etiqueta, orden, proceso_nom),
            servicio:servicios!inner(codigo, nombre, orden)
          `);
        if (todosMismoMes) {
          q = q.eq('anio', dias[0].anio)
               .eq('mes', dias[0].mes)
               .in('dia', dias.map(d => d.dia));
        } else {
          // Rango cruza meses (caso: semana lun-dom atravesando fin/inicio).
          // Agrupamos por (anio, mes) y construimos OR con clausulas
          // "(anio.eq.X,mes.eq.M,dia.in.(d1,d2,...))" para no descargar el año.
          const porAnioMes = new Map<string, number[]>();
          for (const d of dias) {
            const k = `${d.anio}-${d.mes}`;
            if (!porAnioMes.has(k)) porAnioMes.set(k, []);
            porAnioMes.get(k)!.push(d.dia);
          }
          const clausulas = Array.from(porAnioMes.entries()).map(([k, ds]) => {
            const [anioStr, mesStr] = k.split('-');
            return `and(anio.eq.${anioStr},mes.eq.${mesStr},dia.in.(${ds.join(',')}))`;
          });
          q = q.or(clausulas.join(','));
        }
        if (servicioRestriccion != null) q = q.eq('servicio_id', servicioRestriccion);
        promProductividad = q;
      }

      // Lanzar en paralelo
      const [{ data: ocupData, error: ocupErr },
             { data: resData,  error: resErr },
             { data: prodData, error: prodErr }] = await Promise.all([
        promOcup, promResumen, promProductividad,
      ]);

      if (ocupErr) throw ocupErr;
      if (resErr)  throw resErr;
      if (prodErr) throw prodErr;

      setOcupacion((ocupData || []) as Ocupacion[]);

      // Cargar stats de HDL en paralelo (no críticas — degradación silenciosa)
      try {
        const [{ data: ercAll }, { data: prodHdl }] = await Promise.all([
          supabase.from('pacientes_erc').select('id, estatus'),
          supabase
            .from('productividad_capturas')
            .select('indicador_id, valor, catalogo_indicadores_productividad(codigo)')
            .eq('servicio_id', 12) // HDL
            .eq('anio', anio).eq('mes', mes),
        ]);
        const ercTotal = (ercAll || []).length;
        const ercActivos = (ercAll || []).filter((r: any) => {
          const s = (r.estatus || '').toUpperCase();
          return !/EGRESO|BAJA|DEFUNCION/.test(s);
        }).length;
        let hdMes = 0, dpMes = 0;
        for (const c of (prodHdl || []) as any[]) {
          const cod = c.catalogo_indicadores_productividad?.codigo;
          if (cod === 'P06') hdMes += Number(c.valor) || 0;
          else if (cod === 'P05') dpMes += Number(c.valor) || 0;
        }
        setHdlStats({ ercTotal, ercActivos, hdMes, dpMes });
      } catch (e) {
        console.warn('HDL stats failed:', e);
      }

      // ---- Normalizar resumen ----
      if (periodo === 'mes') {
        setResumen((resData || []) as Resumen[]);
      } else {
        // Agrupar egresos del periodo por servicio
        const porServicio = new Map<number, Resumen>();
        for (const p of (resData || []) as any[]) {
          const sub = Array.isArray(p.cama?.subservicio) ? p.cama.subservicio[0] : p.cama?.subservicio;
          const svc = Array.isArray(sub?.servicio) ? sub.servicio[0] : sub?.servicio;
          if (!svc) continue;
          const sid = svc.id as number;
          const motivo = (Array.isArray(p.motivo) ? p.motivo[0]?.nombre : p.motivo?.nombre) || '';
          const motUp = motivo.toUpperCase();
          const r = porServicio.get(sid) || {
            servicio_id: sid,
            codigo: svc.codigo,
            servicio: svc.nombre,
            total_egresos: 0,
            egresos_alta: 0,
            egresos_traslado: 0,
            egresos_defuncion: 0,
            egresos_voluntario: 0,
            egresos_fuga: 0,
            promedio_dias_estancia: 0,
            total_dias_paciente: 0,
          };
          r.total_egresos += 1;
          if (motUp.includes('ALTA'))             r.egresos_alta += 1;
          else if (motUp.includes('TRASLADO'))    r.egresos_traslado += 1;
          else if (motUp.includes('DEFUN'))       r.egresos_defuncion += 1;
          else if (motUp.includes('VOLUNT'))      r.egresos_voluntario += 1;
          else if (motUp.includes('FUGA'))        r.egresos_fuga += 1;
          r.total_dias_paciente += (p.dias_estancia || 0);
          porServicio.set(sid, r);
        }
        // Calcular promedio
        const arr = Array.from(porServicio.values()).map(r => ({
          ...r,
          promedio_dias_estancia: r.total_egresos > 0
            ? Math.round((r.total_dias_paciente / r.total_egresos) * 10) / 10
            : 0,
        }));
        setResumen(arr);
      }

      // ---- Normalizar productividad ----
      if (periodo === 'mes') {
        // Vista v_tablero_productividad ya viene en forma agregada
        const filas = (prodData || []) as any[];
        const celdas: ProdCelda[] = filas.map(f => ({
          servicio_id: f.servicio_id,
          servicio_codigo: f.codigo,
          indicador_codigo: f.indicador_codigo,
          indicador_nombre: f.indicador_nombre,
          indicador_orden: f.indicador_orden,
          proceso: f.proceso,
          total: f.total_mes,
          por_turno: { M: 0, V: 0, N: 0 },  // no se calcula en mes
        }));
        setProductividad(celdas);
      } else {
        // Día/semana: agregar por (servicio, indicador) y desglosar por turno
        const dias = diasEnRango(rangoFechas.ini, rangoFechas.fin);
        const setDiasValidos = new Set(dias.map(d => `${d.anio}-${d.mes}-${d.dia}`));
        const acumulador = new Map<string, ProdCelda>();
        for (const c of (prodData || []) as any[]) {
          const key = `${c.anio}-${c.mes}-${c.dia}`;
          if (!setDiasValidos.has(key)) continue;  // filtro defensivo si vino mas
          const k = `${c.servicio_id}|${c.indicador_id}`;
          const ind = Array.isArray(c.indicador) ? c.indicador[0] : c.indicador;
          const svc = Array.isArray(c.servicio)  ? c.servicio[0]  : c.servicio;
          const cur = acumulador.get(k) || {
            servicio_id: c.servicio_id,
            servicio_codigo: svc?.codigo || '',
            indicador_codigo: ind?.codigo || '',
            indicador_nombre: ind?.etiqueta || '',
            indicador_orden: ind?.orden ?? 999,
            proceso: ind?.proceso_nom || '',
            total: 0,
            por_turno: { M: 0, V: 0, N: 0 },
          };
          cur.total += Number(c.valor || 0);
          const t = c.turno as Turno;
          if (t === 'M' || t === 'V' || t === 'N') {
            cur.por_turno[t] += Number(c.valor || 0);
          }
          acumulador.set(k, cur);
        }
        setProductividad(Array.from(acumulador.values()));
      }
    } catch (e: any) {
      setError(e.message || 'Error cargando tablero');
    } finally {
      setCargando(false);
    }
    // rangoFechas se deriva de [periodo, fechaSel, anio, mes] (mismo useMemo)
    // asi que lo omitimos de las deps para no causar un doble fetch cuando
    // ambos cambian a la vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tieneAcceso, anio, mes, periodo, fechaSel, servicioRestriccion]);

  useEffect(() => { cargar(); }, [cargar]);

  // ============================================================
  // HOOKS DERIVADOS (todos los useMemo deben ir ANTES de los guards
  // para no violar las rules-of-hooks de React)
  // ============================================================

  // Matriz productividad — usar Map para lookup O(1)
  const lookup = useMemo(() => {
    const m = new Map<string, ProdCelda>();
    for (const c of productividad) {
      m.set(`${c.indicador_codigo}|${c.servicio_id}`, c);
    }
    return m;
  }, [productividad]);

  const indicadoresUnicos = useMemo(() => Array.from(
    new Map(productividad.map(p => [p.indicador_codigo, p])).values()
  ).sort((a, b) => a.indicador_orden - b.indicador_orden), [productividad]);

  const serviciosUnicos = useMemo(() => Array.from(
    new Map(ocupacion.map(o => [o.servicio_id, { id: o.servicio_id, codigo: o.codigo, orden: o.orden }])).values()
  ).sort((a, b) => a.orden - b.orden), [ocupacion]);

  // Etiqueta del periodo activo (para titulos)
  const etiquetaPeriodo = useMemo(() => {
    if (periodo === 'mes')    return `${MESES_NOMBRE[mes-1]} ${anio}`;
    if (periodo === 'dia')    return fmtFechaLarga(fechaSel);
    const { ini, fin } = rangoFechas;
    return `${fmtFechaLarga(ini)} → ${fmtFechaLarga(fin)}`;
  }, [periodo, mes, anio, fechaSel, rangoFechas]);

  // ============================================================
  // EXPORT (solo aplica a mes — mantiene comportamiento original)
  // ============================================================
  const handleExportarProductividad = async () => {
    if (!perfil) return;
    setExportando(true);
    setError(null);
    try {
      // Dynamic import: exceljs solo se descarga aqui (lazy)
      const { exportarProductividadMensual } = await import('../utils/exportarProductividad');
      await exportarProductividadMensual(
        anio, mes,
        perfil.nombre_completo || 'Subjefe de Enfermería',
        perfil.rol || 'subjefe'
      );
      window.open(`/imprimir/productividad/${anio}/${mes}?auto=1`, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setError(`Error al exportar: ${e.message || e}`);
    } finally {
      setExportando(false);
    }
  };

  // ============================================================
  // GUARDS
  // ============================================================
  if (!perfil) {
    return <div style={contenedor}><div style={msg}>Verificando perfil...</div></div>;
  }
  if (!tieneAcceso) {
    return (
      <div style={contenedor}>
        <div style={accesoDenegado}>
          <h2 style={{ margin: 0, color: '#A32D2D' }}>🔒 Acceso restringido</h2>
          <p>Esta vista es exclusiva del Jefe, Subjefe, Supervisores y Gestores de servicio.</p>
          <p style={{ fontSize: 12, color: '#888' }}>
            Tu rol actual: <strong>{perfil.rol}</strong>
          </p>
          <button onClick={() => navigate('/')} style={botonVolver}>← Volver al tablero</button>
        </div>
      </div>
    );
  }

  // ============================================================
  // KPIs derivados
  // ============================================================
  const totalCensables          = ocupacion.reduce((a, s) => a + s.total_censables, 0);
  const totalOcupadasCensables  = ocupacion.reduce((a, s) => a + s.ocupadas_censables, 0);
  const totalCamillas           = ocupacion.reduce((a, s) => a + s.total_camillas, 0);
  const totalOcupadasCamillas   = ocupacion.reduce((a, s) => a + s.ocupadas_camillas, 0);
  const totalSillas             = ocupacion.reduce((a, s) => a + (s.total_sillas || 0), 0);
  const totalOcupadasSillas     = ocupacion.reduce((a, s) => a + (s.ocupadas_sillas || 0), 0);
  const porcentajeGlobal        = totalCensables > 0
    ? Math.round((totalOcupadasCensables / totalCensables) * 1000) / 10
    : 0;

  const totalEgresos      = resumen.reduce((a, r) => a + r.total_egresos, 0);
  const totalDefunciones  = resumen.reduce((a, r) => a + r.egresos_defuncion, 0);
  const totalAltas        = resumen.reduce((a, r) => a + r.egresos_alta, 0);
  const totalTraslados    = resumen.reduce((a, r) => a + r.egresos_traslado, 0);
  const totalDiasPaciente = resumen.reduce((a, r) => a + r.total_dias_paciente, 0);
  const promedioEstancia  = totalEgresos > 0
    ? Math.round((totalDiasPaciente / totalEgresos) * 10) / 10
    : 0;

  // Lookup helpers (no son hooks, pueden quedar aqui)
  const getValor = (indicadorCodigo: string, servicioId: number) => {
    return lookup.get(`${indicadorCodigo}|${servicioId}`)?.total ?? 0;
  };
  const getValorTurno = (indicadorCodigo: string, servicioId: number, turno: Turno) => {
    return lookup.get(`${indicadorCodigo}|${servicioId}`)?.por_turno[turno] ?? 0;
  };

  const muestraTurnos = periodo !== 'mes';

  return (
    <div style={contenedor}>
      {/* HEADER con selector de periodo */}
      <div style={header}>
        <button onClick={() => navigate('/')} style={botonVolver}>← Tablero</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <h1 style={titulo}>📊 TABLERO MAESTRO</h1>
          <div style={subtitulo}>Benemérito Hospital General con Especialidades del IMSS-Bienestar "Juan María de Salvatierra"</div>
        </div>
        {esJefeOAdmin(perfil) && (
          <button
            onClick={() => navigate('/supervision')}
            style={{
              ...botonVolver,
              background: '#7d5b2f',
              color: '#fff',
              border: 'none',
              marginRight: 8,
              whiteSpace: 'nowrap',
            }}
            title="Acceder a las herramientas de supervisión (bitácoras, stock, auditoría)"
          >
            🗂️ Supervisión
          </button>
        )}
        <div style={selectorMes}>
          {/* Tabs Día/Semana/Mes (Semana/Mes solo para jefe/subjefe) */}
          <div style={tabsPeriodo}>
            {(tieneTableroCompleto ? (['dia','semana','mes'] as Periodo[]) : (['dia'] as Periodo[])).map(p => (
              <button key={p}
                onClick={() => setPeriodo(p)}
                style={{
                  ...tabBtn,
                  ...(periodo === p ? tabBtnActivo : {}),
                }}>
                {p === 'dia' ? 'Día' : p === 'semana' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>

          {/* Date picker para día/semana */}
          {(periodo === 'dia' || periodo === 'semana') && (
            <input type="date" value={fechaSel}
              onChange={e => setFechaSel(e.target.value)}
              style={selectInput} />
          )}

          {/* Selectores mes/año para mes */}
          {periodo === 'mes' && (
            <>
              <select value={mes} onChange={e => setMes(parseInt(e.target.value))} style={selectInput}>
                {MESES_NOMBRE.map((m, i) => (
                  <option key={i+1} value={i+1}>{m}</option>
                ))}
              </select>
              <select value={anio} onChange={e => setAnio(parseInt(e.target.value))} style={selectInput}>
                {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <button onClick={handleExportarProductividad} disabled={exportando} style={btnExportar}>
                {exportando ? '⏳ Generando...' : '📊 Exportar Excel + PDF'}
              </button>
            </>
          )}
        </div>
      </div>

      {cargando && <div style={msg}>Cargando información hospitalaria...</div>}
      {error && <div style={{ ...msg, color: '#A32D2D' }}>Error: {error}</div>}

      {!cargando && !error && (
        <>
          {/* ===== SECCIÓN 1: RESUMEN EJECUTIVO ===== */}
          <h2 style={seccionTitulo}>🏥 RESUMEN EJECUTIVO ({etiquetaPeriodo})</h2>
          <div style={kpiGrid}>
            <KPI label="% Ocupación censable"  valor={`${porcentajeGlobal}%`}     color="#0E6755" />
            <KPI label="Camas ocupadas"        valor={`${totalOcupadasCensables}/${totalCensables}`} color="#0E6755" />
            <KPI label="Camillas ocupadas"     valor={`${totalOcupadasCamillas}/${totalCamillas}`}   color="#C39C59" subrayado="NO CENSABLES" />
            <KPI label="Sillas ocupadas"       valor={`${totalOcupadasSillas}/${totalSillas}`}       color="#7d5b2f" subrayado="NO CENSABLES" />
            <KPI label={`Egresos ${periodo === 'dia' ? 'del día' : periodo === 'semana' ? 'semanales' : 'del mes'}`}
                 valor={`${totalEgresos}`}        color="#1F4E79" />
            <KPI label="Altas / mejoría"       valor={`${totalAltas}`}          color="#0E6755" />
            <KPI label="Traslados"             valor={`${totalTraslados}`}      color="#7d5b2f" />
            <KPI label="Defunciones"           valor={`${totalDefunciones}`}    color="#A32D2D" />
            <KPI label="Promedio estancia"     valor={`${promedioEstancia} d`}  color="#265C4E" />
          </div>

          {/* ===== SECCIÓN HDL: HEMODIÁLISIS + DIÁLISIS ===== */}
          <h2 style={seccionTitulo}>🩺 HEMODIÁLISIS Y DIÁLISIS</h2>
          <div style={kpiGrid}>
            <KPI label="Pacientes ERC (bitácora total)"  valor={`${hdlStats.ercTotal}`}    color="#0E6755" subrayado="HISTÓRICO" />
            <KPI label="ERC activos hoy"                  valor={`${hdlStats.ercActivos}`} color="#0E6755" />
            <KPI label="Hemodiálisis del mes (P06)"       valor={`${hdlStats.hdMes}`}      color="#1a5f8a" />
            <KPI label="Diálisis peritoneal del mes (P05)" valor={`${hdlStats.dpMes}`}     color="#7d5b2f" />
          </div>

          {/* ===== SECCIÓN 2: OCUPACIÓN POR SERVICIO ===== */}
          <h2 style={seccionTitulo}>📈 OCUPACIÓN ACTUAL POR SERVICIO</h2>
          <div style={tablaWrap}>
            <table style={tabla}>
              <thead>
                <tr style={trHead}>
                  <th style={th}>SERVICIO</th>
                  <th style={thCentrado}>OCUP.</th>
                  <th style={thCentrado}>CENS.</th>
                  <th style={thCentrado}>% OCUP.</th>
                  <th style={{ ...thCentrado, background: '#C39C59' }}>CAMILLAS</th>
                  <th style={{ ...thCentrado, background: '#C39C59' }}>OCUP. CAM.</th>
                  <th style={{ ...thCentrado, background: '#7d5b2f', color: '#fff' }}>SILLAS</th>
                  <th style={{ ...thCentrado, background: '#7d5b2f', color: '#fff' }}>OCUP. SIL.</th>
                  <th style={thBarra}>BARRA</th>
                </tr>
              </thead>
              <tbody>
                {ocupacion.map((s, idx) => (
                  <tr key={s.servicio_id} style={idx % 2 === 0 ? trPar : trImpar}>
                    <td style={tdServicio}><strong>{s.codigo}</strong> · {s.servicio}</td>
                    <td style={tdCentrado}>{s.ocupadas_censables}</td>
                    <td style={tdCentrado}>{s.total_censables}</td>
                    <td style={{ ...tdCentrado, fontWeight: 700, color: s.porcentaje_ocupacion >= 80 ? '#A32D2D' : '#0E6755' }}>
                      {s.porcentaje_ocupacion}%
                    </td>
                    <td style={{ ...tdCentrado, background: '#FAF5EA' }}>{s.total_camillas || '—'}</td>
                    <td style={{ ...tdCentrado, background: '#FAF5EA', fontWeight: 600 }}>{s.total_camillas > 0 ? s.ocupadas_camillas : '—'}</td>
                    <td style={{ ...tdCentrado, background: '#F5EFE0' }}>{s.total_sillas || '—'}</td>
                    <td style={{ ...tdCentrado, background: '#F5EFE0', fontWeight: 600 }}>{s.total_sillas > 0 ? s.ocupadas_sillas : '—'}</td>
                    <td style={tdBarra}>
                      <div style={barraOut}>
                        <div style={{
                          ...barraIn,
                          width: `${Math.min(s.porcentaje_ocupacion, 100)}%`,
                          background: s.porcentaje_ocupacion >= 80 ? '#A32D2D' : s.porcentaje_ocupacion >= 50 ? '#C39C59' : '#0E6755'
                        }} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr style={trTotales}>
                  <td style={{ ...tdServicio, fontWeight: 700 }}>TOTAL HOSPITAL</td>
                  <td style={{ ...tdCentrado, fontWeight: 700 }}>{totalOcupadasCensables}</td>
                  <td style={{ ...tdCentrado, fontWeight: 700 }}>{totalCensables}</td>
                  <td style={{ ...tdCentrado, fontWeight: 700, color: '#0E6755' }}>{porcentajeGlobal}%</td>
                  <td style={{ ...tdCentrado, fontWeight: 700, background: '#FAF5EA' }}>{totalCamillas}</td>
                  <td style={{ ...tdCentrado, fontWeight: 700, background: '#FAF5EA' }}>{totalOcupadasCamillas}</td>
                  <td style={{ ...tdCentrado, fontWeight: 700, background: '#F5EFE0' }}>{totalSillas}</td>
                  <td style={{ ...tdCentrado, fontWeight: 700, background: '#F5EFE0' }}>{totalOcupadasSillas}</td>
                  <td style={tdBarra}>
                    <div style={barraOut}>
                      <div style={{ ...barraIn, width: `${porcentajeGlobal}%`, background: '#0E6755' }} />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===== SECCIÓN 3: EGRESOS DEL PERIODO POR SERVICIO ===== */}
          <h2 style={seccionTitulo}>🚪 EGRESOS POR SERVICIO ({etiquetaPeriodo})</h2>
          <div style={tablaWrap}>
            <table style={tabla}>
              <thead>
                <tr style={trHead}>
                  <th style={th}>SERVICIO</th>
                  <th style={thCentrado}>TOTAL</th>
                  <th style={thCentrado}>ALTAS</th>
                  <th style={thCentrado}>TRASLADOS</th>
                  <th style={{ ...thCentrado, background: '#A32D2D' }}>DEFUNC.</th>
                  <th style={thCentrado}>VOLUNT.</th>
                  <th style={thCentrado}>FUGAS</th>
                  <th style={thCentrado}>PROM. DÍAS</th>
                </tr>
              </thead>
              <tbody>
                {resumen.length === 0 ? (
                  <tr><td colSpan={8} style={vacio}>No hay egresos registrados en {etiquetaPeriodo}</td></tr>
                ) : resumen.map((r, idx) => (
                  <tr key={r.servicio_id} style={idx % 2 === 0 ? trPar : trImpar}>
                    <td style={tdServicio}><strong>{r.codigo}</strong> · {r.servicio}</td>
                    <td style={{ ...tdCentrado, fontWeight: 700 }}>{r.total_egresos}</td>
                    <td style={tdCentrado}>{r.egresos_alta}</td>
                    <td style={tdCentrado}>{r.egresos_traslado}</td>
                    <td style={{ ...tdCentrado, fontWeight: 700, color: r.egresos_defuncion > 0 ? '#A32D2D' : '#888' }}>
                      {r.egresos_defuncion}
                    </td>
                    <td style={tdCentrado}>{r.egresos_voluntario}</td>
                    <td style={tdCentrado}>{r.egresos_fuga}</td>
                    <td style={tdCentrado}>{r.promedio_dias_estancia ?? '—'}</td>
                  </tr>
                ))}
                {resumen.length > 0 && (
                  <tr style={trTotales}>
                    <td style={{ ...tdServicio, fontWeight: 700 }}>TOTAL HOSPITAL</td>
                    <td style={{ ...tdCentrado, fontWeight: 700 }}>{totalEgresos}</td>
                    <td style={{ ...tdCentrado, fontWeight: 700 }}>{totalAltas}</td>
                    <td style={{ ...tdCentrado, fontWeight: 700 }}>{totalTraslados}</td>
                    <td style={{ ...tdCentrado, fontWeight: 700, color: '#A32D2D' }}>{totalDefunciones}</td>
                    <td style={{ ...tdCentrado, fontWeight: 700 }}>{resumen.reduce((a,r)=>a+r.egresos_voluntario,0)}</td>
                    <td style={{ ...tdCentrado, fontWeight: 700 }}>{resumen.reduce((a,r)=>a+r.egresos_fuga,0)}</td>
                    <td style={{ ...tdCentrado, fontWeight: 700 }}>{promedioEstancia}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ===== SECCIÓN 4: PRODUCTIVIDAD CONSOLIDADA ===== */}
          <h2 style={seccionTitulo}>
            📊 PRODUCTIVIDAD CONSOLIDADA ({etiquetaPeriodo})
            {muestraTurnos && <span style={{ fontSize: 11, color: '#888', fontWeight: 400, marginLeft: 8 }}>· con desglose por turno M/V/N</span>}
          </h2>
          <div style={tablaWrap}>
            {indicadoresUnicos.length === 0 ? (
              <div style={vacio}>No hay capturas de productividad para {etiquetaPeriodo}</div>
            ) : (
              <table style={{ ...tabla, fontSize: 10 }}>
                <thead>
                  <tr style={trHead}>
                    <th style={{ ...th, minWidth: 60 }}>CÓDIGO</th>
                    <th style={{ ...th, minWidth: 220 }}>INDICADOR</th>
                    {serviciosUnicos.map(sv => (
                      muestraTurnos ? (
                        <th key={sv.id} colSpan={4} style={{ ...thCentrado, borderBottom: '1px solid #265C4E' }}>{sv.codigo}</th>
                      ) : (
                        <th key={sv.id} style={thCentrado} title={sv.codigo}>{sv.codigo}</th>
                      )
                    ))}
                    <th style={{ ...thCentrado, background: '#0E6755' }}>TOTAL</th>
                  </tr>
                  {muestraTurnos && (
                    <tr style={trHead}>
                      <th style={th}></th>
                      <th style={th}></th>
                      {serviciosUnicos.map(sv => (
                        <React.Fragment key={sv.id}>
                          <th style={{ ...thCentrado, fontSize: 9 }}>M</th>
                          <th style={{ ...thCentrado, fontSize: 9 }}>V</th>
                          <th style={{ ...thCentrado, fontSize: 9 }}>N</th>
                          <th style={{ ...thCentrado, fontSize: 9, background: '#265C4E' }}>T</th>
                        </React.Fragment>
                      ))}
                      <th style={{ ...thCentrado, background: '#0E6755' }}></th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {indicadoresUnicos.map((ind, idx) => {
                    const totalIndicador = serviciosUnicos.reduce((a, sv) => a + getValor(ind.indicador_codigo, sv.id), 0);
                    return (
                      <tr key={ind.indicador_codigo} style={idx % 2 === 0 ? trPar : trImpar}>
                        <td style={{ ...tdServicio, fontWeight: 700, fontSize: 10 }}>{ind.indicador_codigo}</td>
                        <td style={{ ...tdServicio, fontSize: 10 }}>{ind.indicador_nombre}</td>
                        {serviciosUnicos.map(sv => {
                          if (muestraTurnos) {
                            const m = getValorTurno(ind.indicador_codigo, sv.id, 'M');
                            const v = getValorTurno(ind.indicador_codigo, sv.id, 'V');
                            const n = getValorTurno(ind.indicador_codigo, sv.id, 'N');
                            const t = getValor(ind.indicador_codigo, sv.id);
                            return (
                              <React.Fragment key={sv.id}>
                                <td style={{ ...tdCentrado, fontSize: 9, color: m === 0 ? '#ccc' : '#0E6755' }}>{m || '—'}</td>
                                <td style={{ ...tdCentrado, fontSize: 9, color: v === 0 ? '#ccc' : '#0E6755' }}>{v || '—'}</td>
                                <td style={{ ...tdCentrado, fontSize: 9, color: n === 0 ? '#ccc' : '#0E6755' }}>{n || '—'}</td>
                                <td style={{ ...tdCentrado, fontSize: 9, fontWeight: 700, color: t === 0 ? '#ccc' : '#265C4E', background: '#fafafa' }}>{t || '—'}</td>
                              </React.Fragment>
                            );
                          } else {
                            const v = getValor(ind.indicador_codigo, sv.id);
                            return (
                              <td key={sv.id} style={{ ...tdCentrado, fontSize: 10, color: v === 0 ? '#ccc' : '#0E6755' }}>
                                {v || '—'}
                              </td>
                            );
                          }
                        })}
                        <td style={{ ...tdCentrado, fontWeight: 700, fontSize: 10, background: '#F5F1E8', color: '#0E6755' }}>
                          {totalIndicador}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginTop: 32, marginBottom: 32, fontSize: 11, color: '#888', textAlign: 'center', fontStyle: 'italic' }}>
            Tablero generado · Benemérito Hospital General con Especialidades del IMSS-Bienestar "Juan María de Salvatierra" · CLUES BSIMB000672
            <br />Subjefe responsable: {perfil.nombre_completo} ({perfil.rol})
          </div>
        </>
      )}
    </div>
  );
}

// Componente KPI tarjeta
function KPI({ label, valor, color, subrayado }: { label: string; valor: string; color: string; subrayado?: string }) {
  return (
    <div style={{ ...kpiCard, borderTopColor: color }}>
      <div style={{ ...kpiValor, color }}>{valor}</div>
      <div style={kpiLabel}>{label}</div>
      {subrayado && <div style={kpiSubrayado}>{subrayado}</div>}
    </div>
  );
}

// ============ ESTILOS ============
const contenedor: React.CSSProperties = { padding: 'clamp(8px, 2vw, 20px)', maxWidth: 1600, margin: '0 auto', background: '#F5F1E8', minHeight: '100vh' };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #C39C59', flexWrap: 'wrap', gap: 8 };
const titulo: React.CSSProperties = { fontSize: 22, color: '#0E6755', margin: 0 };
const subtitulo: React.CSSProperties = { fontSize: 11, color: '#888', marginTop: 4 };
const botonVolver: React.CSSProperties = { background: 'transparent', border: '1px solid #0E6755', color: '#0E6755', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' };
const selectorMes: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const tabsPeriodo: React.CSSProperties = { display: 'flex', border: '1px solid #C39C59', borderRadius: 4, overflow: 'hidden' };
const tabBtn: React.CSSProperties = { background: '#fff', color: '#0E6755', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', borderRight: '1px solid #C39C59' };
const tabBtnActivo: React.CSSProperties = { background: '#0E6755', color: '#fff' };
const selectInput: React.CSSProperties = { padding: '6px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' };
const msg: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#265C4E', fontSize: 14 };
const accesoDenegado: React.CSSProperties = { padding: 40, textAlign: 'center', background: '#fff', borderRadius: 8, border: '2px solid #A32D2D', marginTop: 40 };
const seccionTitulo: React.CSSProperties = { fontSize: 16, color: '#0E6755', marginTop: 24, marginBottom: 12, paddingBottom: 6, borderBottom: '2px solid #C39C59' };
const kpiGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 };
const kpiCard: React.CSSProperties = { background: '#fff', padding: 14, borderRadius: 6, borderTop: '4px solid #0E6755', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', textAlign: 'center' };
const kpiValor: React.CSSProperties = { fontSize: 26, fontWeight: 700, lineHeight: 1 };
const kpiLabel: React.CSSProperties = { fontSize: 11, color: '#666', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.3 };
const kpiSubrayado: React.CSSProperties = { fontSize: 9, color: '#C39C59', marginTop: 2, fontWeight: 700 };
const tablaWrap: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', borderRadius: 6, overflowX: 'auto' };
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const trHead: React.CSSProperties = { background: '#0E6755' };
const th: React.CSSProperties = { padding: '8px 6px', color: '#fff', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: 0.3, borderRight: '1px solid #265C4E' };
const thCentrado: React.CSSProperties = { ...th, textAlign: 'center' };
const thBarra: React.CSSProperties = { ...th, width: 140 };
const trPar: React.CSSProperties = { background: '#fff' };
const trImpar: React.CSSProperties = { background: '#fdfaf2' };
const trTotales: React.CSSProperties = { background: '#F5F1E8', borderTop: '2px solid #0E6755' };
const tdServicio: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #e8dfc6', color: '#265C4E' };
const tdCentrado: React.CSSProperties = { ...tdServicio, textAlign: 'center' };
const tdBarra: React.CSSProperties = { ...tdServicio, width: 140 };
const barraOut: React.CSSProperties = { width: '100%', height: 14, background: '#F5F1E8', borderRadius: 3, overflow: 'hidden', border: '1px solid #e8dfc6' };
const barraIn: React.CSSProperties = { height: '100%', transition: 'width 0.3s', background: '#0E6755' };
const vacio: React.CSSProperties = { padding: 24, textAlign: 'center', color: '#888', fontStyle: 'italic' };
const btnExportar: React.CSSProperties = {
  background: 'linear-gradient(135deg, #0E6755 0%, #265C4E 100%)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  marginLeft: 12,
  letterSpacing: 0.3,
  boxShadow: '0 2px 4px rgba(14,103,85,0.3)',
};
