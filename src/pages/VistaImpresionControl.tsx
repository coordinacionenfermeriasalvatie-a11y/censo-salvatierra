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

// ---------- Tipos ----------
interface Servicio {
  id: number;
  nombre: string;
  total_camas: number;
}

interface PacienteImpresion {
  // Identificación
  id: string;
  numero_cama: string;
  nombre_paciente: string;
  edad: number | null;
  genero: string | null;
  nss_curp: string | null;
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
          .select('id, nombre, total_camas')
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
            genero,
            nss_curp,
            diagnostico_ingreso,
            fecha_ingreso,
            hora_ingreso,
            dias_estancia,
            observaciones,
            estado,
            cama:camas!inner (
              numero_cama,
              subservicio:subservicios!inner ( servicio_id )
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
          return {
            id: p.id,
            numero_cama: cama?.numero_cama ?? '',
            nombre_paciente: p.nombre_paciente,
            edad: p.edad,
            genero: p.genero,
            nss_curp: p.nss_curp,
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

        // Ordenar por número de cama (intentando numérico, fallback a string)
        norm.sort((a, b) => {
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

      {/* Encabezado institucional */}
      <header style={headerBox}>
        <div style={headerLinea1}>
          BENEMÉRITO HOSPITAL GENERAL CON ESPECIALIDADES IMSS-BIENESTAR
        </div>
        <div style={headerLinea2}>
          "JUAN MARÍA DE SALVATIERRA" — CLUES BSIMB000672
        </div>
        <div style={headerLinea3}>
          COORDINACIÓN DE ENFERMERÍA — FORMATO CONTROL DE PACIENTES
        </div>
      </header>

      {/* Sub-encabezado */}
      <div style={subHeaderBox}>
        <span><b>FECHA:</b> {fechaHoyLarga()}</span>
        <span><b>SERVICIO:</b> {servicio?.nombre ?? '--'}</span>
        <span><b>OCUPACIÓN:</b> {camasOcupadas} de {totalCamas} camas</span>
      </div>

      {/* Tabla principal — 37 columnas */}
      <table className="tabla-control">
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
            {/* IDENTIFICACIÓN (9) — CAMA/EDAD/SEXO horizontal corto, resto vertical */}
            <th className="col-h">CAMA</th>
            <th className="col-v">NOMBRE COMPLETO</th>
            <th className="col-h">EDAD</th>
            <th className="col-h">SEXO</th>
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
          {pacientes.map((p) => (
            <tr key={p.id}>
              {/* IDENTIFICACIÓN */}
              <td className="c-cama">{p.numero_cama}</td>
              <td className="c-nombre">{limpiar(p.nombre_paciente)}</td>
              <td className="c-num">{p.edad ?? ''}</td>
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
          ))}
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
          margin: 7mm 5mm;
        }

        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }

        @media screen {
          .hoja-impresion {
            background: white;
            max-width: 1600px;
            margin: 60px auto 20px;
            padding: 12px;
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
          font-size: 6pt;
          table-layout: fixed;
          margin-top: 4px;
        }
        .tabla-control th,
        .tabla-control td {
          border: 0.4px solid #555;
          padding: 1.5px 2px;
          vertical-align: top;
          word-wrap: break-word;
          overflow: hidden;
        }
        .tabla-control thead th {
          background: #f0f0f0;
          font-weight: 700;
          text-align: center;
          font-size: 5.5pt;
          line-height: 1.05;
        }
        /* Encabezados de columna ROTADOS (vertical, lectura de abajo hacia arriba).
           Permite que etiquetas largas como "PRECAUCIONES AISLAMIENTO" quepan
           en columnas estrechas sin partirse en múltiples líneas. */
        .tabla-control thead th.col-v {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          vertical-align: middle;
          height: 105px;
          padding: 6px 2px;
          font-size: 7pt;
          line-height: 1.1;
          white-space: nowrap;
        }
        /* Encabezados HORIZONTALES para columnas con texto corto */
        .tabla-control thead th.col-h {
          vertical-align: middle;
          height: 105px;
          padding: 2px;
          font-size: 7pt;
          line-height: 1.1;
        }
        .tabla-control .grupo-row th {
          color: white;
          font-size: 6.8pt;
          padding: 3px 2px;
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
          height: 26px;
        }
        .tabla-control .c-cama {
          font-weight: 700;
          background: #f5f1e8;
          font-size: 8pt;
        }
        .tabla-control .c-nombre {
          text-align: left;
          font-weight: 700;
          font-size: 6.5pt;
          line-height: 1.15;
        }
        .tabla-control .c-dx,
        .tabla-control .c-esp {
          text-align: left;
          font-size: 6pt;
          line-height: 1.15;
        }
        .tabla-control .c-id {
          font-size: 5.8pt;
          font-family: 'Courier New', monospace;
        }
        .tabla-control .c-num {
          font-size: 6pt;
        }
        .tabla-control .c-corto,
        .tabla-control .c-tags {
          font-size: 5.5pt;
          text-align: left;
          line-height: 1.15;
        }
        .tabla-control .c-obs {
          text-align: left;
          font-size: 5.5pt;
          line-height: 1.15;
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
  textAlign: 'center', marginBottom: 6,
  borderBottom: '2px solid #0E6755', paddingBottom: 4,
};
const headerLinea1: React.CSSProperties = {
  background: '#C39C59', color: '#000', fontWeight: 700,
  fontSize: 9, padding: '3px 0', letterSpacing: 0.3,
};
const headerLinea2: React.CSSProperties = {
  background: '#0E6755', color: '#fff', fontWeight: 700,
  fontSize: 9, padding: '3px 0',
};
const headerLinea3: React.CSSProperties = {
  background: '#fff', color: '#0E6755', fontWeight: 700,
  fontSize: 8.5, padding: '3px 0',
};
const subHeaderBox: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  fontSize: 8, padding: '3px 4px', marginBottom: 2,
  borderTop: '1px solid #555', borderBottom: '1px solid #555',
  background: '#fafafa',
};
const pieBox: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  marginTop: 12, paddingTop: 6,
  borderTop: '1px solid #555',
};
const firma: React.CSSProperties = {
  width: '32%', textAlign: 'center',
};
const firmaLinea: React.CSSProperties = {
  borderBottom: '1px solid #000', height: 18, marginBottom: 2,
};
const firmaLabel: React.CSSProperties = {
  fontSize: 7, color: '#444',
};
