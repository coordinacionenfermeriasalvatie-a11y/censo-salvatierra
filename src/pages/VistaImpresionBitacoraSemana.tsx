// Vista de impresión de la bitácora semanal de psicotrópicos.
// Replica el formato oficial del PDF de Control de Medicamentos Psicotrópicos.
// Ruta: /imprimir/bitacora-semana?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//
// Tamaño: oficio horizontal (para que quepan las 7 días × 3 turnos × 4 cols).
// Header oficial con logos. Tabla principal (medicamentos × días) +
// tabla inferior (detalle de vales canjeados de la semana).

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface MedSemana {
  inventario_id: number;
  orden: number;
  nombre: string;
  presentacion: string | null;
  unidad: string;
  fondo_fijo: number;
  fecha: string;
  m_surtido: number; m_recibido: number; m_utilizado: number; m_vales: number;
  v_surtido: number; v_recibido: number; v_utilizado: number; v_vales: number;
  n_surtido: number; n_recibido: number; n_utilizado: number; n_vales: number;
}

interface DetalleRow {
  receta_id: string;
  folio: string;
  folio_salida: string | null;
  fecha_dia: string;
  turno: 'M' | 'V' | 'N';
  paciente_cama: string | null;
  paciente_nombre: string;
  paciente_genero: string | null;
  no_expediente: string | null;
  paciente_diagnostico: string | null;
  servicio_codigo: string | null;
  paciente_subservicio: string | null;
  medicamento_nombre: string;
  cantidad_numero: string | null;
  medico_nombre: string | null;
  enfermero_solicita: string;
  supervisora: string | null;
  observaciones: string | null;
}

const DIAS = [
  { key: 'Lunes',     dow: 1 },
  { key: 'Martes',    dow: 2 },
  { key: 'Miércoles', dow: 3 },
  { key: 'Jueves',    dow: 4 },
  { key: 'Viernes',   dow: 5 },
  { key: 'Sábado',    dow: 6 },
  { key: 'Domingo',   dow: 0 },
];

const lunesDeSemana = (iso: string): string => {
  const d = new Date(iso + 'T12:00:00');
  const dow = d.getDay(); // 0=domingo
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
};
const domingoDeSemana = (lunesIso: string): string => {
  const d = new Date(lunesIso + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
};
const rangoSemana = (lunesIso: string): string[] => {
  const out: string[] = [];
  const d = new Date(lunesIso + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
};

export const VistaImpresionBitacoraSemana: React.FC = () => {
  const [params] = useSearchParams();
  const desdeParam = params.get('desde');
  const lunes = desdeParam || lunesDeSemana(new Date().toISOString().slice(0, 10));
  const domingo = domingoDeSemana(lunes);

  const [medsSemana, setMedsSemana] = useState<MedSemana[]>([]);
  const [detalle, setDetalle] = useState<DetalleRow[]>([]);
  const [folio, setFolio] = useState<string>('');
  const [generadoPor, setGeneradoPor] = useState<string>('');

  useEffect(() => {
    (async () => {
      const [{ data: m }, { data: d }, { data: usr }] = await Promise.all([
        supabase.from('v_bitacora_psicotropicos_semana')
          .select('*').gte('fecha', lunes).lte('fecha', domingo),
        supabase.from('v_bitacora_psicotropicos_detalle')
          .select('*').gte('fecha_dia', lunes).lte('fecha_dia', domingo)
          .order('fecha_dia').order('canjeado_en', { nullsFirst: false }),
        supabase.from('perfiles').select('nombre_completo').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').single(),
      ]);
      setMedsSemana((m || []) as MedSemana[]);
      setDetalle((d || []) as DetalleRow[]);
      setGeneradoPor((usr as any)?.nombre_completo || '');
      // Folio del documento: BIT-YYYY-WW (semana del año, lunes a domingo)
      const wk = numeroSemanaIso(lunes);
      const anio = new Date(lunes + 'T12:00:00').getFullYear();
      setFolio(`BIT-${anio}-S${String(wk).padStart(2, '0')}`);
    })();
  }, [lunes, domingo]);

  useEffect(() => {
    if (medsSemana.length > 0) setTimeout(() => window.print(), 500);
  }, [medsSemana.length]);

  // Pivot: por medicamento, datos de cada uno de los 7 días
  const inventario = useMemo(() => {
    const map = new Map<number, MedSemana>();
    for (const r of medsSemana) {
      if (!map.has(r.inventario_id)) map.set(r.inventario_id, r);
    }
    return Array.from(map.values()).sort((a, b) => a.orden - b.orden);
  }, [medsSemana]);

  const datosPorMedDia = useMemo(() => {
    const m = new Map<string, MedSemana>();
    for (const r of medsSemana) m.set(`${r.inventario_id}|${r.fecha}`, r);
    return m;
  }, [medsSemana]);

  const fechas = rangoSemana(lunes);

  return (
    <div style={pagina}>
      <style>{`
        @media print {
          @page { size: legal landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        @media screen { body { background: #ccc; } }
      `}</style>

      <div className="no-print" style={barra}>
        <button onClick={() => window.print()} style={btnImp}>🖨️ Imprimir</button>
        <button onClick={() => window.close()} style={btnCer}>✕ Cerrar</button>
      </div>

      {/* HEADER OFICIAL */}
      <div style={headerOfi}>
        <img src="/logos/imss_bienestar.png" alt="IMSS-Bienestar" style={logo} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={titMenor}>Servicios Públicos de Salud · IMSS-BIENESTAR</div>
          <div style={titMayor}>BENEMÉRITO HOSPITAL GENERAL CON ESPECIALIDADES DEL IMSS-BIENESTAR</div>
          <div style={titMayor}>"JUAN MARÍA DE SALVATIERRA" — CLUES BSIMB000672</div>
          <div style={titMenor}>Unidad de Atención a la Salud · Coordinación de Enfermería</div>
        </div>
        <img src="/logos/LOGO_HOSPITAL.jpg" alt='Hospital "Juan María de Salvatierra"' style={logo} />
      </div>

      <div style={tituloDoc}>CONTROL MEDICAMENTOS PSICOTRÓPICOS — BITÁCORA SEMANAL</div>

      {/* META */}
      <div style={metaFila}>
        <div><strong>Folio:</strong> <span style={folioCss}>{folio}</span></div>
        <div><strong>Semana:</strong> {fechas[0]} — {fechas[6]}</div>
        <div><strong>Generado:</strong> {new Date().toLocaleString('es-MX')}</div>
        <div><strong>Por:</strong> {generadoPor}</div>
      </div>

      {/* TABLA PRINCIPAL */}
      <table style={tabla}>
        <thead>
          <tr>
            <th rowSpan={3} style={{ ...th, textAlign: 'left' as const, minWidth: 90 }}>Medicamento</th>
            <th rowSpan={3} style={{ ...th, minWidth: 28 }}>Unidad</th>
            <th rowSpan={3} style={{ ...th, minWidth: 28 }}>Fondo<br/>fijo</th>
            {DIAS.map((d, i) => (
              <th key={d.key} colSpan={12} style={{ ...thDia, background: i % 2 === 0 ? '#0E6755' : '#7d5b2f' }}>
                {d.key} <span style={{ fontWeight: 400, fontSize: 7 }}>{fechas[i]}</span>
              </th>
            ))}
          </tr>
          <tr>
            {DIAS.map(d => (
              <React.Fragment key={d.key}>
                <th colSpan={4} style={thTurno}>TM</th>
                <th colSpan={4} style={thTurno}>TV</th>
                <th colSpan={4} style={thTurno}>TN</th>
              </React.Fragment>
            ))}
          </tr>
          <tr>
            {DIAS.map(d => (
              <React.Fragment key={d.key}>
                {['M','V','N'].map(t => (
                  <React.Fragment key={t}>
                    <th style={thMini}>Sur</th>
                    <th style={thMini}>Rec</th>
                    <th style={thMini}>Util</th>
                    <th style={thMini}>Val</th>
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {inventario.map((inv, i) => (
            <tr key={inv.inventario_id} style={i % 2 === 0 ? trAlt : undefined}>
              <td style={tdNombre}>
                <strong style={{ fontSize: 8 }}>{inv.nombre}</strong>
                {inv.presentacion && <div style={{ fontSize: 6.5, color: '#666' }}>{inv.presentacion}</div>}
              </td>
              <td style={tdC}>{inv.unidad}</td>
              <td style={{ ...tdC, fontWeight: 700 }}>{inv.fondo_fijo}</td>
              {fechas.map(f => {
                const d = datosPorMedDia.get(`${inv.inventario_id}|${f}`);
                return (
                  <React.Fragment key={f}>
                    {(['m','v','n'] as const).map(t => (
                      <React.Fragment key={t}>
                        <td style={tdMini}>{d ? ((d as any)[`${t}_surtido`] || '') : ''}</td>
                        <td style={tdMini}>{d ? ((d as any)[`${t}_recibido`] || '') : ''}</td>
                        <td style={tdMini}>{d ? ((d as any)[`${t}_utilizado`] || '') : ''}</td>
                        <td style={tdMini}>{d ? ((d as any)[`${t}_vales`] || '') : ''}</td>
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={firmaRecepcion}>
        <strong>Personal de Enfermería responsable de la recepción:</strong>
        <span style={{ borderBottom: '1px solid #000', display: 'inline-block', width: 380, marginLeft: 8, height: 14 }} />
      </div>

      {/* TABLA DE DETALLE (autollenada con los vales canjeados de la semana) */}
      <div style={subTitulo}>DETALLE DE VALES — SEMANA {fechas[0]} a {fechas[6]}</div>
      <table style={tablaDet}>
        <thead>
          <tr>
            <th style={thDet}>Folio</th>
            <th style={thDet}>Folio salida</th>
            <th style={thDet}>Cama</th>
            <th style={{ ...thDet, minWidth: 110 }}>Nombre del Paciente</th>
            <th style={thDet}>Género</th>
            <th style={thDet}>No. expediente</th>
            <th style={{ ...thDet, minWidth: 110 }}>Diagnóstico principal</th>
            <th style={thDet}>Servicio</th>
            <th style={{ ...thDet, minWidth: 100 }}>Medicamento</th>
            <th style={thDet}>Cantidad</th>
            <th style={thDet}>Médico</th>
            <th style={{ ...thDet, minWidth: 100 }}>Enfermero solicita</th>
            <th style={{ ...thDet, minWidth: 100 }}>Supervisora</th>
            <th style={{ ...thDet, minWidth: 80 }}>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {detalle.length === 0 ? (
            // 12 filas vacías para llenado manual si no hubo vales
            Array.from({ length: 12 }).map((_, i) => (
              <tr key={`vacio-${i}`} style={trVacio}>
                {Array.from({ length: 14 }).map((__, j) => <td key={j} style={tdDet}>&nbsp;</td>)}
              </tr>
            ))
          ) : (
            <>
              {detalle.map(r => (
                <tr key={r.receta_id}>
                  <td style={tdDet}>{r.folio}</td>
                  <td style={tdDet}>{r.folio_salida || '—'}</td>
                  <td style={tdDet}>{r.paciente_cama}</td>
                  <td style={tdDet}>{r.paciente_nombre}</td>
                  <td style={tdDet}>{r.paciente_genero}</td>
                  <td style={tdDet}>{r.no_expediente}</td>
                  <td style={tdDet}>{r.paciente_diagnostico}</td>
                  <td style={tdDet}>{r.servicio_codigo}</td>
                  <td style={tdDet}>{r.medicamento_nombre}</td>
                  <td style={tdDet}>{r.cantidad_numero}</td>
                  <td style={tdDet}>{r.medico_nombre}</td>
                  <td style={tdDet}>{r.enfermero_solicita}</td>
                  <td style={tdDet}>{r.supervisora || '—'}</td>
                  <td style={tdDet}>{r.observaciones || ''}</td>
                </tr>
              ))}
              {/* Filas extra vacías para anotaciones manuales si quedan */}
              {Array.from({ length: Math.max(0, 6 - detalle.length) }).map((_, i) => (
                <tr key={`extra-${i}`} style={trVacio}>
                  {Array.from({ length: 14 }).map((__, j) => <td key={j} style={tdDet}>&nbsp;</td>)}
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>

      <div style={pie}>
        Documento generado automáticamente desde el Sistema de Censo Hospitalario · Folio {folio} ·
        Hoja semanal {fechas[0]} a {fechas[6]} · {detalle.length} vale{detalle.length !== 1 ? 's' : ''} registrado{detalle.length !== 1 ? 's' : ''}.
        Conserve junto con las recetas individuales para auditoría.
      </div>
    </div>
  );
};

function numeroSemanaIso(iso: string): number {
  const d = new Date(iso + 'T12:00:00');
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

// ============================================================
const pagina: React.CSSProperties = {
  width: '356mm', minHeight: '215mm', margin: '0 auto', background: '#fff',
  padding: '8mm', boxSizing: 'border-box', fontFamily: '"Times New Roman", Georgia, serif',
  color: '#000', fontSize: 8,
};
const barra: React.CSSProperties = { position: 'fixed' as const, top: 8, right: 8, display: 'flex', gap: 8, zIndex: 10 };
const btnImp: React.CSSProperties = { background: '#0E6755', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontFamily: 'sans-serif' };
const btnCer: React.CSSProperties = { background: '#888', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'sans-serif' };

const headerOfi: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, borderBottom: '2px double #0E6755', paddingBottom: 4, marginBottom: 4 };
const logo: React.CSSProperties = { height: 38, width: 'auto', objectFit: 'contain' as const, flexShrink: 0 };
const titMayor: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#0E6755' };
const titMenor: React.CSSProperties = { fontSize: 7, color: '#7d5b2f', fontStyle: 'italic' as const };
const tituloDoc: React.CSSProperties = { background: '#0E6755', color: '#fff', textAlign: 'center' as const, fontWeight: 700, padding: '3px 0', marginBottom: 4, fontSize: 10, letterSpacing: 0.5 };

const metaFila: React.CSSProperties = { display: 'flex', gap: 14, padding: '3px 6px', background: '#f5f5f5', border: '1px solid #ccc', marginBottom: 4, fontSize: 7.5 };
const folioCss: React.CSSProperties = { fontFamily: 'monospace', background: '#fff', padding: '0 4px', border: '1px solid #ccc' };

const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' as const, fontSize: 7, marginBottom: 4 };
const th: React.CSSProperties = { background: '#f5f1e8', color: '#7d5b2f', padding: '3px 2px', textAlign: 'center' as const, fontWeight: 700, fontSize: 7, border: '0.8px solid #888' };
const thDia: React.CSSProperties = { color: '#fff', padding: '2px', textAlign: 'center' as const, fontWeight: 700, fontSize: 7.5, border: '0.8px solid #888' };
const thTurno: React.CSSProperties = { background: '#7d5b2f', color: '#fff', padding: '2px', textAlign: 'center' as const, fontWeight: 700, fontSize: 7, border: '0.8px solid #888' };
const thMini: React.CSSProperties = { background: '#f5f1e8', padding: '1px', textAlign: 'center' as const, fontWeight: 600, fontSize: 6, color: '#7d5b2f', border: '0.5px solid #aaa' };
const trAlt: React.CSSProperties = { background: '#fafafa' };
const tdNombre: React.CSSProperties = { padding: '2px 3px', textAlign: 'left' as const, border: '0.5px solid #ccc', verticalAlign: 'top' as const };
const tdC: React.CSSProperties = { padding: '2px', textAlign: 'center' as const, border: '0.5px solid #ccc' };
const tdMini: React.CSSProperties = { padding: '2px 1px', textAlign: 'center' as const, border: '0.5px solid #ccc', fontSize: 7.5, minWidth: 12 };

const firmaRecepcion: React.CSSProperties = { padding: '4px 0', fontSize: 8, marginBottom: 6, marginTop: 2 };

const subTitulo: React.CSSProperties = { background: '#7d5b2f', color: '#fff', textAlign: 'center' as const, padding: '3px 0', marginBottom: 2, fontWeight: 700, fontSize: 9, letterSpacing: 0.3 };
const tablaDet: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' as const, fontSize: 7 };
const thDet: React.CSSProperties = { background: '#f5f1e8', color: '#7d5b2f', padding: '2px 3px', textAlign: 'center' as const, fontWeight: 700, fontSize: 7, border: '0.8px solid #888' };
const tdDet: React.CSSProperties = { padding: '2px 3px', border: '0.5px solid #ccc', fontSize: 7, verticalAlign: 'top' as const };
const trVacio: React.CSSProperties = { height: 14 };
const pie: React.CSSProperties = { marginTop: 6, fontSize: 7, color: '#666', borderTop: '1px solid #ccc', paddingTop: 4, textAlign: 'center' as const, fontStyle: 'italic' as const };
