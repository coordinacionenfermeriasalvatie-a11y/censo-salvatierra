// src/pages/VistaImpresionControl.tsx
// =====================================================================
// IMPRESIÓN — FORMATO CONTROL DE PACIENTES (Pase de visita)
// =====================================================================
// v2 (19-may-2026): Schema real (camas → subservicios → servicios),
//                   37 columnas con etiquetas exactas de la UI digital.
//
// Vista dedicada para imprimir el censo completo del servicio en una
// tabla horizontal tipo Google Sheets, tamaño OFICIO (legal) horizontal.
// Combina:
//   - Datos de INGRESO de tabla `pacientes`
//   - Datos clínicos de `formato_control_paciente` (1:1 con pacientes)
//   - Nombre de cama vía JOIN con `camas`
//   - Nombre de especialidad vía JOIN con `catalogo_especialidades`
//   - Filtro por servicio: pacientes.cama_id → camas.subservicio_id
//                          → subservicios.servicio_id
//
// Ruta: /imprimir/control/:servicioId
// =====================================================================

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Evento, TipoEvento } from '../hooks/useEventosApoyo';
import { EncabezadoOficial } from './components/EncabezadoOficial';

// ---------- Tipos ----------
interface Servicio {
  id: number;
  codigo?: string;
  nombre: string;
  total_camas: number;
}

interface PacienteImpresion {
  // Identificación
  id: string;
  numero_cama: string;
  es_censable: boolean;
  subservicio: string | null;
  subservicio_orden: number | null;
  subservicio_completo: string | null;
  nombre_paciente: string;
  edad: number | null;
  edad_unidad: string | null;
  genero: string | null;
  nss_curp: string | null;
  fecha_nacimiento: string | null;
  diagnostico_ingreso: string | null;
  especialidad_nombre: string | null;
  fecha_ingreso: string | null;
  hora_ingreso: string | null;
  dias_estancia: number | null;
  observaciones_ingreso: string | null;

  // Campos legacy que SIGUEN en formato_control_paciente
  riesgo_upp: string | null;
  riesgo_caidas: string | null;
  causa_no_ocupacion: string | null;
  traslado: string | null;
  observaciones_control: string | null;

  // Eventos (Fase B+C: chips y fechas viven en evento_apoyo_paciente)
  eventos: Evento[];
}

// ---------- Utilidades ----------
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatearFechaCorta(val: string | null): string {
  if (!val) return '';
  const s = String(val).trim();
  if (!s || s === '--') return '';

  // Intento 1: parse directo (ISO, '2026-05-19', '2026-05-19 15:05')
  const d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = MESES[d.getMonth()];
    const hh = d.getHours();
    const mm = d.getMinutes();
    if (hh !== 0 || mm !== 0) {
      return `${dia}-${mes} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    return `${dia}-${mes}`;
  }

  // Intento 2: texto libre → truncar
  return s.length > 12 ? s.substring(0, 12) : s;
}

function formatearFechaIngreso(fecha: string | null): string {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-').map(Number);
  if (!y || !m || !d) return fecha;
  return `${String(d).padStart(2, '0')}-${MESES[m - 1]}-${String(y).slice(-2)}`;
}

function limpiar(val: string | null): string {
  if (!val) return '';
  return String(val).trim();
}

function fechaHoyLarga(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// ---------- Helpers para eventos (Fase B+C) ----------

// Filtra eventos activos (no cancelados) por tipo y opcional codigo.
function eventosActivos(eventos: Evento[], tipo: TipoEvento, codigo?: string): Evento[] {
  return eventos.filter(e =>
    e.tipo === tipo
    && e.estado !== 'Cancelada'
    && (codigo === undefined || e.codigo === codigo)
  );
}

// Devuelve la fecha_realizacion mas reciente de un (tipo, codigo) en formato corto.
// Si no hay evento Realizada/Retirada, devuelve ''.
function fechaPorCodigo(eventos: Evento[], tipo: TipoEvento, codigo: string): string {
  const candidatos = eventosActivos(eventos, tipo, codigo)
    .filter(e => e.fecha_realizacion)
    .sort((a, b) => +new Date(b.fecha_realizacion!) - +new Date(a.fecha_realizacion!));
  if (candidatos.length === 0) return '';
  return formatearFechaCorta(candidatos[0].fecha_realizacion);
}

// Devuelve un CSV con los codigos de los eventos activos de ese tipo.
function codigosCsv(eventos: Evento[], tipo: TipoEvento): string {
  const codigos = eventosActivos(eventos, tipo).map(e => e.codigo);
  // Deduplica conservando orden
  return Array.from(new Set(codigos)).join(', ');
}

// True si hay al menos un evento Realizada del tipo.
function tieneAlgunRealizado(eventos: Evento[], tipo: TipoEvento): boolean {
  return eventos.some(e => e.tipo === tipo && e.estado === 'Realizada');
}

// Codigo del evento Realizada mas reciente del tipo (o '' si no hay).
function codigoUnicoMasReciente(eventos: Evento[], tipo: TipoEvento): string {
  const candidatos = eventosActivos(eventos, tipo)
    .filter(e => e.estado === 'Realizada')
    .sort((a, b) => +new Date(b.fecha_realizacion ?? b.fecha_solicitud) - +new Date(a.fecha_realizacion ?? a.fecha_solicitud));
  return candidatos.length > 0 ? candidatos[0].codigo : '';
}

// Observaciones del evento de aislamiento mas reciente (donde se guarda el label real)
function obsAislamiento(eventos: Evento[]): string {
  const candidatos = eventosActivos(eventos, 'precaucion_aislamiento')
    .sort((a, b) => +new Date(b.fecha_realizacion ?? b.fecha_solicitud) - +new Date(a.fecha_realizacion ?? a.fecha_solicitud));
  if (candidatos.length === 0) return '';
  const obs = candidatos[0].observaciones || '';
  // Si las observaciones empiezan con "Migrado de ... :" extraer solo el label
  const m = obs.match(/:\s*(.+)$/);
  return m ? m[1].trim() : obs;
}

// ---------- Componente ----------
export const VistaImpresionControl: React.FC = () => {
  const { servicioId } = useParams<{ servicioId: string }>();
  const [searchParams] = useSearchParams();
  const autoImprimir = searchParams.get('auto') !== '0';

  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [pacientes, setPacientes] = useState<PacienteImpresion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const svcId = Number(servicioId);

        // 1. Servicio
        const { data: svc, error: errSvc } = await supabase
          .from('servicios')
          .select('id, codigo, nombre, total_camas')
          .eq('id', svcId)
          .single();
        if (errSvc) throw errSvc;
        setServicio(svc);

        // 2. Pacientes activos del servicio
        // Cadena de JOINs: pacientes → camas → subservicios (servicio_id)
        //                  + catalogo_especialidades + formato_control_paciente
        const { data: pacs, error: errPac } = await supabase
          .from('pacientes')
          .select(`
            id,
            nombre_paciente,
            edad,
            edad_unidad,
            genero,
            nss_curp,
            fecha_nacimiento,
            diagnostico_ingreso,
            fecha_ingreso,
            hora_ingreso,
            dias_estancia,
            observaciones,
            estado,
            cama:camas!inner (
              numero_cama,
              es_censable,
              subservicio:subservicios!inner ( id, nombre, nombre_completo, orden, servicio_id )
            ),
            especialidad:catalogo_especialidades ( nombre ),
            formato_control_paciente (
              riesgo_upp, riesgo_caidas, causa_no_ocupacion,
              traslado, observaciones
            )
          `)
          .eq('estado', 'ACTIVO');

        if (errPac) throw errPac;

        // Filtrar en cliente por servicio_id (PostgREST no permite filtrar
        // en columnas relacionadas 2 niveles abajo de forma directa)
        const filtrados = (pacs || []).filter((p: any) =>
          p.cama?.subservicio?.servicio_id === svcId
        );

        // Normalizar y ordenar por número de cama
        const norm: PacienteImpresion[] = filtrados.map((p: any) => {
          const cama = Array.isArray(p.cama) ? p.cama[0] : p.cama;
          const esp = Array.isArray(p.especialidad) ? p.especialidad[0] : p.especialidad;
          const fc = Array.isArray(p.formato_control_paciente)
            ? p.formato_control_paciente[0]
            : p.formato_control_paciente;
          const sub = Array.isArray(cama?.subservicio) ? cama?.subservicio[0] : cama?.subservicio;
          return {
            id: p.id,
            numero_cama: cama?.numero_cama ?? '',
            es_censable: cama?.es_censable ?? true,
            subservicio: sub?.nombre ?? null,
            subservicio_orden: sub?.orden ?? null,
            subservicio_completo: sub?.nombre_completo ?? null,
            nombre_paciente: p.nombre_paciente,
            edad: p.edad,
            edad_unidad: p.edad_unidad,
            genero: p.genero,
            nss_curp: p.nss_curp,
            fecha_nacimiento: p.fecha_nacimiento,
            diagnostico_ingreso: p.diagnostico_ingreso,
            especialidad_nombre: esp?.nombre ?? null,
            fecha_ingreso: p.fecha_ingreso,
            hora_ingreso: p.hora_ingreso,
            dias_estancia: p.dias_estancia,
            observaciones_ingreso: p.observaciones,
            // legacy aun en formato_control_paciente
            riesgo_upp: fc?.riesgo_upp ?? null,
            riesgo_caidas: fc?.riesgo_caidas ?? null,
            causa_no_ocupacion: fc?.causa_no_ocupacion ?? null,
            traslado: fc?.traslado ?? null,
            observaciones_control: fc?.observaciones ?? null,
            // eventos: pegados después con un fetch separado
            eventos: [],
          };
        });

        // 3. Eventos de apoyo para todos los pacientes encontrados (Fase B+C)
        const ids = norm.map(p => p.id);
        if (ids.length > 0) {
          const { data: evs, error: errEv } = await supabase
            .from('evento_apoyo_paciente')
            .select('*')
            .in('paciente_id', ids);
          if (errEv) throw errEv;
          const porPaciente = new Map<string, Evento[]>();
          for (const e of (evs || []) as Evento[]) {
            if (!porPaciente.has(e.paciente_id)) porPaciente.set(e.paciente_id, []);
            porPaciente.get(e.paciente_id)!.push(e);
          }
          for (const p of norm) {
            p.eventos = porPaciente.get(p.id) || [];
          }
        }

        // Ordenar primero por subservicio_orden (UTIP, UCIN…, OBSERVACIÓN,
        // SALA DE CHOQUE…) y luego por número de cama. En servicios de un solo
        // subservicio el orden es constante, así que equivale a ordenar por cama.
        norm.sort((a, b) => {
          const oa = a.subservicio_orden ?? 9999;
          const ob = b.subservicio_orden ?? 9999;
          if (oa !== ob) return oa - ob;
          // Dentro del subservicio: censables primero, luego no censables.
          if (a.es_censable !== b.es_censable) return a.es_censable ? -1 : 1;
          const na = parseInt(a.numero_cama, 10);
          const nb = parseInt(b.numero_cama, 10);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.numero_cama.localeCompare(b.numero_cama);
        });

        setPacientes(norm);
      } catch (e: any) {
        console.error('[VistaImpresionControl] error:', e);
        setError(e.message || 'Error al cargar datos');
      } finally {
        setCargando(false);
      }
    })();
  }, [servicioId]);

  // Auto-imprimir cuando termina de cargar
  useEffect(() => {
    if (!cargando && !error && pacientes.length > 0 && autoImprimir) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [cargando, error, pacientes.length, autoImprimir]);

  if (cargando) {
    return <div style={{ padding: 40, fontFamily: 'Arial', textAlign: 'center' }}>
      Cargando censo del servicio…
    </div>;
  }
  if (error) {
    return <div style={{ padding: 40, fontFamily: 'Arial', color: '#A32D2D' }}>
      ⚠️ {error}
    </div>;
  }

  const camasOcupadas = pacientes.length;
  const totalCamas = servicio?.total_camas ?? 0;
  const filasVacias = Math.max(0, totalCamas - camasOcupadas);
  // Servicios con varios subservicios (Urgencias, Toco Cirugía, Pediatría):
  // se agrupan en secciones con encabezado de subservicio.
  const haySubservicios = new Set(pacientes.map((p) => p.subservicio).filter(Boolean)).size > 1;

  return (
    <div className="hoja-impresion">
      {/* Botones flotantes (ocultos al imprimir) */}
      <div className="no-print" style={barraTop}>
        <button onClick={() => window.print()} style={btnPrint}>🖨️ Imprimir</button>
        <button onClick={() => window.close()} style={btnCerrar}>✕ Cerrar</button>
        <span style={{ marginLeft: 12, color: '#666', fontSize: 12 }}>
          Vista previa de impresión · Tamaño: <b>Oficio horizontal</b> · 36 columnas
        </span>
      </div>

      {/* Encabezado institucional con logos */}
      <EncabezadoOficial formato="FORMATO CONTROL DE PACIENTES — INTERVENCIONES DE ENFERMERÍA" />

      {/* Sub-encabezado */}
      <div style={subHeaderBox}>
        <span><b>FECHA:</b> {fechaHoyLarga()}</span>
        <span><b>SERVICIO:</b> {servicio?.nombre ?? '--'}</span>
        <span><b>OCUPACIÓN:</b> {camasOcupadas} de {totalCamas} camas</span>
      </div>

      {/* Tabla principal — 37 columnas */}
      <table className="tabla-control">
        {/* Anchos explícitos: con table-layout:fixed, estas columnas mandan.
            NOMBRE recibe el bloque más grande (10%) para que quepa en una
            sola fila sin partirse. CAMA/EDAD/SEXO chicos. Eventos verticales
            uniformes para ahorrar espacio. */}
        <colgroup>
          {/* IDENTIFICACIÓN (9) */}
          <col style={{ width: '2.0%' }} />   {/* CAMA */}
          <col style={{ width: '10.0%' }} />  {/* NOMBRE */}
          <col style={{ width: '1.6%' }} />   {/* EDAD */}
          <col style={{ width: '1.6%' }} />   {/* SEXO */}
          <col style={{ width: '4.0%' }} />   {/* NSS / CURP */}
          <col style={{ width: '6.0%' }} />   {/* DX */}
          <col style={{ width: '3.5%' }} />   {/* ESPECIALIDAD */}
          <col style={{ width: '2.4%' }} />   {/* FECHA INGRESO */}
          <col style={{ width: '2.4%' }} />   {/* HORA INGRESO */}
          {/* VASCULARES (8) */}
          <col span={8} style={{ width: '2.05%' }} />
          {/* SONDAS (3) */}
          <col span={3} style={{ width: '2.05%' }} />
          {/* PROCEDIMIENTOS (3) */}
          <col span={3} style={{ width: '2.05%' }} />
          {/* RIESGOS (4) */}
          <col style={{ width: '2.2%' }} />   {/* UPP */}
          <col style={{ width: '2.2%' }} />   {/* CAÍDAS */}
          <col style={{ width: '2.6%' }} />   {/* CAUSA NO OCUP */}
          <col style={{ width: '2.6%' }} />   {/* AISLAMIENTO */}
          {/* APOYOS (8) */}
          <col span={8} style={{ width: '2.6%' }} />
          {/* OBS GENERAL (1) */}
          <col style={{ width: '4.3%' }} />
        </colgroup>
        <thead>
          <tr className="grupo-row">
            <th colSpan={9} className="g-id">IDENTIFICACIÓN E INGRESO</th>
            <th colSpan={8} className="g-vasc">ACCESOS VASCULARES (fecha automática)</th>
            <th colSpan={3} className="g-sondas">SONDAS Y DISPOSITIVOS</th>
            <th colSpan={3} className="g-cura">PROCEDIMIENTOS Y CURACIONES</th>
            <th colSpan={4} className="g-riesgo">RIESGOS Y AISLAMIENTO</th>
            <th colSpan={8} className="g-apoyo">APOYOS Y ESTUDIOS</th>
            <th colSpan={1} className="g-obs">OBS. GENERAL</th>
          </tr>
          <tr className="col-row">
            {/* IDENTIFICACIÓN (9) — CAMA/NOMBRE horizontal; EDAD/SEXO verticales
                (de abajo hacia arriba) para que no se partan en columna estrecha */}
            <th className="col-h">CAMA</th>
            <th className="col-h">NOMBRE COMPLETO</th>
            <th className="col-v">EDAD</th>
            <th className="col-v">SEXO</th>
            <th className="col-v">NSS / CURP / EXPEDIENTE</th>
            <th className="col-v">DIAGNÓSTICO DE INGRESO</th>
            <th className="col-v">ESPECIALIDAD</th>
            <th className="col-v">FECHA INGRESO</th>
            <th className="col-v">HORA INGRESO</th>
            {/* VASCULARES (8) — todos verticales */}
            <th className="col-v">VENTILACIÓN MECÁNICA</th>
            <th className="col-v">INSTALACIÓN CVP (VENOCLISIS)</th>
            <th className="col-v">INSTALACIÓN CVC</th>
            <th className="col-v">CATÉTER UMBILICAL</th>
            <th className="col-v">LISIS / LAVADO CATÉTER</th>
            <th className="col-v">CURACIÓN SITIO CVP</th>
            <th className="col-v">CURACIÓN SITIO CVC</th>
            <th className="col-v">REFIJACIÓN CVC</th>
            {/* SONDAS (3) */}
            <th className="col-v">SONDA GÁSTRICA (NSG/OSG)</th>
            <th className="col-v">SONDA PLEUROSTOMÍA</th>
            <th className="col-v">CATÉTER URINARIO</th>
            {/* PROCEDIMIENTOS (3) */}
            <th className="col-v">ESTOMAS</th>
            <th className="col-v">HERIDAS</th>
            <th className="col-v">SUTURAS REALIZADAS</th>
            {/* RIESGOS (4) */}
            <th className="col-v">RIESGO UPP</th>
            <th className="col-v">RIESGO CAÍDAS</th>
            <th className="col-v">CAUSA NO OCUPACIÓN</th>
            <th className="col-v">PRECAUCIONES AISLAMIENTO</th>
            {/* APOYOS (8) */}
            <th className="col-v">OXÍGENO</th>
            <th className="col-v">INTERCONSULTA</th>
            <th className="col-v">GLUCEMIA CAPILAR</th>
            <th className="col-v">HEMODERIVADOS</th>
            <th className="col-v">LABORATORIOS</th>
            <th className="col-v">ESTUDIOS GABINETE</th>
            <th className="col-v">TRASLADO</th>
            <th className="col-v">HIGIENE PACIENTE</th>
            {/* OBS GENERAL (1) */}
            <th className="col-v">OBSERVACIONES GENERALES</th>
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p, idx) => {
            // En servicios con subservicios: insertar encabezado por subservicio
            // antes del primer paciente de cada grupo. Romper página entre grupos
            // (excepto el 1°).
            const subActual = p.subservicio;
            const subAnterior = idx > 0 ? pacientes[idx - 1].subservicio : null;
            const inicioGrupo = haySubservicios && subActual !== subAnterior;
            // Divisor "NO CENSABLES": primera cama no censable de su subservicio
            // (la precede una censable del mismo subservicio). Separa reposets/
            // cunas/camillas de las camas censables dentro del mismo bloque.
            const previo = idx > 0 ? pacientes[idx - 1] : null;
            const inicioNoCensable =
              !p.es_censable && previo != null && previo.es_censable && previo.subservicio === subActual;
            const divisorNoCensable = inicioNoCensable ? (
              <tr key={`nocens-${p.id}`} className="sub-nocensable">
                <td colSpan={36}>NO CENSABLES</td>
              </tr>
            ) : null;
            const encabezadoSub = inicioGrupo ? (
              <tr
                key={`sub-${subActual}-${p.id}`}
                className={idx === 0 ? 'sub-encabezado-pac primera' : 'sub-encabezado-pac'}
              >
                <td colSpan={36}>
                  <span className="sub-abrev">{subActual}</span>
                  {p.subservicio_completo && p.subservicio_completo !== subActual && (
                    <span className="sub-completo"> · {p.subservicio_completo}</span>
                  )}
                </td>
              </tr>
            ) : null;
            return (
              <React.Fragment key={p.id}>
                {encabezadoSub}
                {divisorNoCensable}
                <tr>
              {/* IDENTIFICACIÓN */}
              <td className="c-cama">{p.numero_cama}</td>
              <td className="c-nombre">
                {limpiar(p.nombre_paciente)}
                {p.fecha_nacimiento && (
                  <div className="fecha-nac">F.Nac: {(() => {
                    const [y, m, d] = p.fecha_nacimiento.split('-');
                    return y && m && d ? `${d}/${m}/${y}` : p.fecha_nacimiento;
                  })()}</div>
                )}
              </td>
              <td className="c-num">{p.edad != null ? `${p.edad}${p.edad_unidad === 'DIAS' ? 'd' : p.edad_unidad === 'MESES' ? 'm' : ''}` : ''}</td>
              <td className="c-num">{limpiar(p.genero)}</td>
              <td className="c-id">{limpiar(p.nss_curp)}</td>
              <td className="c-dx">{limpiar(p.diagnostico_ingreso)}</td>
              <td className="c-esp">{limpiar(p.especialidad_nombre)}</td>
              <td className="c-num">{formatearFechaIngreso(p.fecha_ingreso)}</td>
              <td className="c-num">
                {limpiar(p.hora_ingreso)?.substring(0, 5)}
                {p.dias_estancia !== null && (
                  <div className="badge-dias-block">({p.dias_estancia}d)</div>
                )}
              </td>
              {/* VASCULARES (lee de evento_apoyo_paciente) */}
              <td>{fechaPorCodigo(p.eventos, 'dispositivo', 'VM')}</td>
              <td>{fechaPorCodigo(p.eventos, 'acceso_vascular', 'CVP')}</td>
              <td>{fechaPorCodigo(p.eventos, 'acceso_vascular', 'CVC')}</td>
              <td>{fechaPorCodigo(p.eventos, 'acceso_vascular', 'UMBILICAL')}</td>
              <td>{fechaPorCodigo(p.eventos, 'procedimiento', 'LIS')}</td>
              <td>{fechaPorCodigo(p.eventos, 'curacion', 'CUR_CVP')}</td>
              <td>{fechaPorCodigo(p.eventos, 'curacion', 'CUR_CVC')}</td>
              <td>{fechaPorCodigo(p.eventos, 'curacion', 'REF_CVC')}</td>
              {/* SONDAS */}
              <td>{fechaPorCodigo(p.eventos, 'sonda', 'SG')}</td>
              <td>{fechaPorCodigo(p.eventos, 'sonda', 'SPL')}</td>
              <td>{fechaPorCodigo(p.eventos, 'sonda', 'CU')}</td>
              {/* PROCEDIMIENTOS */}
              <td>{fechaPorCodigo(p.eventos, 'procedimiento', 'EST')}</td>
              <td>{fechaPorCodigo(p.eventos, 'curacion', 'HERIDA')}</td>
              <td>{fechaPorCodigo(p.eventos, 'procedimiento', 'SUT')}</td>
              {/* RIESGOS (legacy, siguen en formato_control_paciente) */}
              <td>{limpiar(p.riesgo_upp)}</td>
              <td>{limpiar(p.riesgo_caidas)}</td>
              <td className="c-corto">{limpiar(p.causa_no_ocupacion)}</td>
              <td className="c-corto">{obsAislamiento(p.eventos)}</td>
              {/* APOYOS (CSV chips, ahora vienen de eventos activos) */}
              <td className="c-tags">{codigosCsv(p.eventos, 'oxigeno')}</td>
              <td className="c-tags">{codigosCsv(p.eventos, 'interconsulta')}</td>
              <td>{tieneAlgunRealizado(p.eventos, 'glucemia') ? 'SI' : ''}</td>
              <td className="c-tags">{codigosCsv(p.eventos, 'hemoderivado')}</td>
              <td className="c-tags">{codigosCsv(p.eventos, 'laboratorio')}</td>
              <td className="c-tags">{codigosCsv(p.eventos, 'estudio_gabinete')}</td>
              <td className="c-corto">{limpiar(p.traslado)}</td>
              <td>{codigoUnicoMasReciente(p.eventos, 'higiene')}</td>
              {/* OBS GENERAL */}
              <td className="c-obs">{limpiar(p.observaciones_control)}</td>
            </tr>
              </React.Fragment>
            );
          })}
          {/* Filas vacías hasta total de camas */}
          {Array.from({ length: filasVacias }).map((_, i) => (
            <tr key={`vacia-${i}`} className="fila-vacia">
              <td className="c-cama">·</td>
              <td colSpan={35}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pie con firmas */}
      <footer style={pieBox}>
        <div style={firma}>
          <div style={firmaLinea}></div>
          <div style={firmaLabel}>ELABORÓ — Enfermera(o) responsable</div>
        </div>
        <div style={firma}>
          <div style={firmaLinea}></div>
          <div style={firmaLabel}>SUPERVISÓ — Jefe(a) de servicio</div>
        </div>
        <div style={firma}>
          <div style={firmaLinea}></div>
          <div style={firmaLabel}>TURNO _____   FOLIO _____   HOJA 1 DE 1</div>
        </div>
      </footer>

      {/* Estilos de impresión */}
      <style>{`
        @page {
          size: legal landscape;
          margin: 5mm 4mm;
        }

        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          /* Conservar colores de los headers de grupo en la impresión */
          .tabla-control .grupo-row th,
          .tabla-control .c-cama { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* No partir filas entre páginas; el ajuste de columnas hace que
             todo quepa en una sola hoja legal horizontal. */
          .tabla-control tr { page-break-inside: avoid; }
          .hoja-impresion { padding: 0 !important; }
          /* PEDIATRÍA: cada subservicio en su propia hoja.
             La primera sección no rompe página. */
          .tabla-control .sub-encabezado-pac {
            page-break-before: always;
            break-before: page;
          }
          .tabla-control .sub-encabezado-pac.primera {
            page-break-before: auto;
            break-before: auto;
          }
        }
        /* Estilo de encabezado de subservicio (también en pantalla) */
        .tabla-control .sub-encabezado-pac td {
          background: #FAF5EA !important;
          border-left: 6px solid #C39C59;
          padding: 6px 10px;
          text-align: left;
          font-family: Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .tabla-control .sub-encabezado-pac .sub-abrev {
          font-size: 14pt;
          font-weight: 800;
          color: #0E6755;
          letter-spacing: 0.5px;
        }
        .tabla-control .sub-encabezado-pac .sub-completo {
          font-size: 9pt;
          color: #7d5b2f;
          text-transform: uppercase;
        }
        /* Divisor de camas no censables (reposets/cunas/camillas) dentro
           del mismo subservicio. NO rompe página: queda pegado a su bloque. */
        .tabla-control .sub-nocensable td {
          background: #F3EFE3 !important;
          border-left: 6px solid #9c7b3f;
          border-top: 2px dashed #C39C59;
          padding: 3px 10px;
          text-align: left;
          font-family: Arial, sans-serif;
          font-size: 9pt;
          font-weight: 800;
          letter-spacing: 1px;
          color: #7d5b2f;
          text-transform: uppercase;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media screen {
          .hoja-impresion {
            background: white;
            max-width: 1700px;
            margin: 60px auto 20px;
            padding: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          }
        }

        .hoja-impresion {
          font-family: Arial, sans-serif;
          color: #000;
        }

        .tabla-control {
          width: 100%;
          border-collapse: collapse;
          font-size: 5.5pt;
          table-layout: fixed;
          margin-top: 3px;
        }
        .tabla-control th,
        .tabla-control td {
          border: 0.4px solid #555;
          padding: 1px 1.5px;
          vertical-align: top;
          word-wrap: break-word;
          overflow: hidden;
        }
        .tabla-control thead th {
          background: #f0f0f0;
          font-weight: 700;
          text-align: center;
          font-size: 5pt;
          line-height: 1.05;
        }
        /* Encabezados de columna ROTADOS (vertical, lectura de abajo hacia arriba).
           Permite que etiquetas largas como "PRECAUCIONES AISLAMIENTO" quepan
           en columnas estrechas sin partirse en múltiples líneas. */
        .tabla-control thead th.col-v {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          vertical-align: middle;
          height: 92px;
          padding: 4px 1px;
          font-size: 6pt;
          line-height: 1.05;
          white-space: nowrap;
        }
        /* Encabezados HORIZONTALES para columnas con texto corto */
        .tabla-control thead th.col-h {
          vertical-align: middle;
          height: 92px;
          padding: 2px;
          font-size: 6pt;
          line-height: 1.05;
        }
        .tabla-control .grupo-row th {
          color: white;
          font-size: 6pt;
          padding: 2.5px 2px;
          letter-spacing: 0.2px;
        }
        .tabla-control .g-id     { background: #6b7d8a; }
        .tabla-control .g-vasc   { background: #2a5d8f; }
        .tabla-control .g-sondas { background: #0E6755; }
        .tabla-control .g-cura   { background: #8a5a2a; }
        .tabla-control .g-riesgo { background: #A32D2D; }
        .tabla-control .g-apoyo  { background: #5b3a8a; }
        .tabla-control .g-obs    { background: #555; }

        .tabla-control tbody td {
          text-align: center;
          height: 22px;
        }
        .tabla-control .c-cama {
          font-weight: 700;
          background: #f5f1e8;
          font-size: 7pt;
        }
        /* NOMBRE en una sola fila: nowrap + overflow ellipsis para que la
           columna se ajuste al texto disponible sin partirlo en 2 líneas. */
        .tabla-control .c-nombre {
          text-align: left;
          font-weight: 700;
          font-size: 6pt;
          line-height: 1.05;
        }
        /* Nombre en una línea, fecha de nacimiento debajo en menor tamaño. */
        .tabla-control .c-nombre .fecha-nac {
          font-size: 4.8pt;
          font-weight: 500;
          color: #555;
          margin-top: 1px;
          font-family: 'Courier New', monospace;
        }
        .tabla-control .c-dx,
        .tabla-control .c-esp {
          text-align: left;
          font-size: 5.5pt;
          line-height: 1.1;
        }
        .tabla-control .c-id {
          font-size: 5.3pt;
          font-family: 'Courier New', monospace;
        }
        .tabla-control .c-num {
          font-size: 5.5pt;
        }
        .tabla-control .c-corto,
        .tabla-control .c-tags {
          font-size: 5pt;
          text-align: left;
          line-height: 1.1;
        }
        .tabla-control .c-obs {
          text-align: left;
          font-size: 5pt;
          line-height: 1.1;
        }
        .tabla-control .badge-dias {
          background: #265C4E;
          color: white;
          padding: 0 3px;
          border-radius: 3px;
          font-size: 5pt;
          margin-left: 2px;
        }
        .tabla-control .badge-dias-block {
          background: #265C4E;
          color: white;
          padding: 1px 3px;
          border-radius: 3px;
          font-size: 5pt;
          margin-top: 2px;
          display: inline-block;
        }
        .tabla-control .fila-vacia td {
          height: 24px;
          background: #fafafa;
        }
        .tabla-control .fila-vacia .c-cama {
          color: #aaa;
          background: #f0ebe0;
        }
      `}</style>
    </div>
  );
};

// ---------- Estilos inline (encabezado/pie) ----------
const barraTop: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0,
  background: '#265C4E', color: '#fff', padding: '8px 16px',
  zIndex: 100, display: 'flex', alignItems: 'center', gap: 10,
  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
};
const btnPrint: React.CSSProperties = {
  background: '#fff', color: '#265C4E', border: 'none',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, fontWeight: 700,
  cursor: 'pointer',
};
const btnCerrar: React.CSSProperties = {
  background: 'transparent', color: '#fff', border: '1px solid #fff',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};
const headerBox: React.CSSProperties = {
  textAlign: 'center', marginBottom: 3,
  borderBottom: '1.5px solid #0E6755', paddingBottom: 2,
};
const headerLinea1: React.CSSProperties = {
  background: '#C39C59', color: '#000', fontWeight: 700,
  fontSize: 8, padding: '2px 0', letterSpacing: 0.3,
};
const headerLinea2: React.CSSProperties = {
  background: '#0E6755', color: '#fff', fontWeight: 700,
  fontSize: 8, padding: '2px 0',
};
const headerLinea3: React.CSSProperties = {
  background: '#fff', color: '#0E6755', fontWeight: 700,
  fontSize: 7.5, padding: '2px 0',
};
const subHeaderBox: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  fontSize: 7.5, padding: '2px 4px', marginBottom: 1,
  borderTop: '1px solid #555', borderBottom: '1px solid #555',
  background: '#fafafa',
};
const pieBox: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  marginTop: 6, paddingTop: 3,
  borderTop: '1px solid #555',
};
const firma: React.CSSProperties = {
  width: '32%', textAlign: 'center',
};
const firmaLinea: React.CSSProperties = {
  borderBottom: '1px solid #000', height: 12, marginBottom: 1,
};
const firmaLabel: React.CSSProperties = {
  fontSize: 6.5, color: '#444',
};
