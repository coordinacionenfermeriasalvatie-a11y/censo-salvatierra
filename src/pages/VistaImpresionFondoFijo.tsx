// Hoja diaria de impresión del Fondo Fijo de Psicotrópicos.
// Ruta: /imprimir/fondo-fijo?fecha=YYYY-MM-DD  (default: hoy Mazatlán)
//
// Incluye TODO junto, como pidió supervisión:
//   1) Movimiento de 24 h: fondo fijo, recibido, utilizado y vales por
//      turno (M/V/N), y stock final por medicamento.
//   2) Detalle de vales del día.
//   3) Firmas de Entrega / Recibe (nombre del responsable que recibe).
// Encabezado institucional unificado (EncabezadoOficial).

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { ROLES_ADMIN_GLOBAL } from '../types';
import { EncabezadoOficial } from './components/EncabezadoOficial';

interface StockRow {
  id: number;
  orden: number;
  nombre: string;
  presentacion: string | null;
  unidad: string;
  fondo_fijo: number;
  recibido_total: number;
  surtido_total: number;
  utilizado_total: number;
  vales_total: number;
  utilizado_m: number; utilizado_v: number; utilizado_n: number;
  vales_m: number; vales_v: number; vales_n: number;
  stock_actual: number;
}

interface DetalleRow {
  receta_id: string;
  folio: string;
  folio_salida: string | null;
  turno: 'M' | 'V' | 'N';
  paciente_cama: string | null;
  paciente_nombre: string;
  paciente_genero: string | null;
  no_expediente: string | null;
  paciente_diagnostico: string | null;
  servicio_codigo: string | null;
  medicamento_nombre: string;
  cantidad_numero: string | null;
  medico_nombre: string | null;
  enfermero_solicita: string;
  supervisora: string | null;
  observaciones: string | null;
  estado_aprobacion: string;
}

const hoyMazatlan = (): string => {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'America/Mazatlan', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const filaVacia = (i: any): StockRow => ({
  id: i.id, orden: i.orden, nombre: i.nombre, presentacion: i.presentacion,
  unidad: i.unidad, fondo_fijo: i.fondo_fijo,
  recibido_total: 0, surtido_total: 0, utilizado_total: 0, vales_total: 0,
  utilizado_m: 0, utilizado_v: 0, utilizado_n: 0,
  vales_m: 0, vales_v: 0, vales_n: 0,
  stock_actual: i.fondo_fijo,
});

export const VistaImpresionFondoFijo: React.FC = () => {
  const { perfil } = useAuth();
  const [params] = useSearchParams();
  const fecha = params.get('fecha') || hoyMazatlan();
  const esHoy = fecha === hoyMazatlan();
  const supParam = params.get('supervision');
  const supervision: 1 | 2 | null = supParam === '1' ? 1 : supParam === '2' ? 2 : null;

  const [filas, setFilas] = useState<StockRow[]>([]);
  const [detalle, setDetalle] = useState<DetalleRow[]>([]);
  const [generadoPor, setGeneradoPor] = useState('');
  const [listo, setListo] = useState(false);

  const autorizado = perfil == null || ROLES_ADMIN_GLOBAL.includes(perfil.rol);

  useEffect(() => {
    if (!autorizado) return;
    (async () => {
      // Detalle de vales del día. Si la hoja es de una supervisión, se
      // filtran los vales según el servicio de origen. El reparto vive en
      // la BD (servicios.supervision, mig 58); no se hardcodea aquí.
      const { data: det } = await supabase.from('v_bitacora_psicotropicos_detalle')
        .select('*').eq('fecha_dia', fecha)
        .order('canjeado_en', { nullsFirst: false });
      let dets = (det || []) as DetalleRow[];
      if (supervision != null) {
        const { data: servs } = await supabase.from('servicios').select('codigo, supervision');
        const supDe = new Map<string, number | null>((servs || []).map((s: any) => [s.codigo, s.supervision]));
        dets = dets.filter(d => supDe.get(d.servicio_codigo ?? '') === supervision);
      }
      setDetalle(dets);

      // Movimiento del día
      if (esHoy) {
        const { data } = await supabase.from('v_stock_psicotropicos_hoy').select('*');
        setFilas((data || []) as StockRow[]);
      } else {
        // Reconstruir desde movimientos para la fecha indicada (igual que la bitácora).
        const { data: inv } = await supabase.from('inventario_psicotropicos')
          .select('*').eq('activo', true).order('orden');
        const { data: movs } = await supabase.from('movimientos_psicotropicos')
          .select('*').eq('fecha', fecha);
        const map = new Map<number, StockRow>();
        (inv || []).forEach((i: any) => map.set(i.id, filaVacia(i)));
        (movs || []).forEach((m: any) => {
          const f = map.get(m.inventario_id);
          if (!f) return;
          const tk = (m.turno as string).toLowerCase() as 'm' | 'v' | 'n';
          if (m.tipo === 'recibido') { f.recibido_total += m.cantidad; f.stock_actual += m.cantidad; }
          else if (m.tipo === 'utilizado') { f.utilizado_total += m.cantidad; (f as any)[`utilizado_${tk}`] += m.cantidad; f.stock_actual -= m.cantidad; }
          else if (m.tipo === 'surtido') { f.surtido_total += m.cantidad; f.stock_actual -= m.cantidad; }
          else if (m.tipo === 'vale') { f.vales_total += m.cantidad; (f as any)[`vales_${tk}`] += m.cantidad; }
        });
        setFilas(Array.from(map.values()).sort((a, b) => a.orden - b.orden));
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: usr } = await supabase.from('perfiles').select('nombre_completo').eq('id', user.id).single();
        setGeneradoPor((usr as any)?.nombre_completo || '');
      }
      setListo(true);
    })();
  }, [fecha, esHoy, autorizado, supervision]);

  useEffect(() => {
    if (listo && filas.length > 0) setTimeout(() => window.print(), 500);
  }, [listo, filas.length]);

  const totales = useMemo(() => ({
    fondo: filas.reduce((s, f) => s + f.fondo_fijo, 0),
    recibido: filas.reduce((s, f) => s + f.recibido_total, 0),
    util_m: filas.reduce((s, f) => s + f.utilizado_m, 0),
    util_v: filas.reduce((s, f) => s + f.utilizado_v, 0),
    util_n: filas.reduce((s, f) => s + f.utilizado_n, 0),
    vales_m: filas.reduce((s, f) => s + f.vales_m, 0),
    vales_v: filas.reduce((s, f) => s + f.vales_v, 0),
    vales_n: filas.reduce((s, f) => s + f.vales_n, 0),
    stock: filas.reduce((s, f) => s + f.stock_actual, 0),
  }), [filas]);

  if (!autorizado) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#A32D2D', fontSize: 16 }}>
        🚫 Esta hoja es exclusiva para jefatura, subjefatura y supervisión de enfermería.
        <div style={{ marginTop: 16 }}>
          <button onClick={() => window.close()} style={{ background: '#888', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer' }}>✕ Cerrar</button>
        </div>
      </div>
    );
  }

  const fechaLarga = new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div style={pagina}>
      <style>{`
        @media print {
          @page { size: letter landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        @media screen { body { background: #ccc; } }
      `}</style>

      <div className="no-print" style={barra}>
        <button onClick={() => window.print()} style={btnImp}>🖨️ Imprimir</button>
        <button onClick={() => window.close()} style={btnCer}>✕ Cerrar</button>
      </div>

      <EncabezadoOficial formato="CONTROL DE MEDICAMENTOS PSICOTRÓPICOS — HOJA DIARIA DEL FONDO FIJO" />

      {/* META */}
      <div style={metaFila}>
        <div><strong>Supervisión:</strong> {supervision === 1 ? 'I' : supervision === 2 ? 'II' : 'Todas'}</div>
        <div><strong>Fecha:</strong> {fechaLarga}</div>
        <div><strong>Generó:</strong> {generadoPor || '—'}</div>
        <div><strong>Impreso:</strong> {new Date().toLocaleString('es-MX')}</div>
      </div>

      {/* MOVIMIENTO DE 24 HORAS */}
      <div style={subTitulo}>MOVIMIENTO DE 24 HORAS</div>
      <table style={tabla}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...th, textAlign: 'left' as const, minWidth: 110 }}>Medicamento Psicotrópico</th>
            <th rowSpan={2} style={th}>Unidad</th>
            <th rowSpan={2} style={th}>Fondo<br />fijo</th>
            <th rowSpan={2} style={{ ...th, background: '#2c5fa3', color: '#fff' }}>Recibido<br />(24 h)</th>
            <th colSpan={2} style={{ ...thTurno, background: '#5CAB34' }}>Matutino</th>
            <th colSpan={2} style={{ ...thTurno, background: '#C39C59' }}>Vespertino</th>
            <th colSpan={2} style={{ ...thTurno, background: '#A32D2D' }}>Nocturno</th>
            <th rowSpan={2} style={{ ...th, background: '#0E6755', color: '#fff' }}>Stock<br />final</th>
          </tr>
          <tr>
            <th style={thMini}>Util.</th><th style={thMini}>Vales</th>
            <th style={thMini}>Util.</th><th style={thMini}>Vales</th>
            <th style={thMini}>Util.</th><th style={thMini}>Vales</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f.id} style={i % 2 === 0 ? trAlt : undefined}>
              <td style={tdNombre}>
                <strong>{f.nombre}</strong>
                {f.presentacion && <div style={{ fontSize: 6.5, color: '#666' }}>{f.presentacion}</div>}
              </td>
              <td style={tdC}>{f.unidad}</td>
              <td style={{ ...tdC, fontWeight: 700 }}>{f.fondo_fijo}</td>
              <td style={tdC}>{f.recibido_total || ''}</td>
              <td style={tdC}>{f.utilizado_m || ''}</td>
              <td style={tdC}>{f.vales_m || ''}</td>
              <td style={tdC}>{f.utilizado_v || ''}</td>
              <td style={tdC}>{f.vales_v || ''}</td>
              <td style={tdC}>{f.utilizado_n || ''}</td>
              <td style={tdC}>{f.vales_n || ''}</td>
              <td style={{ ...tdC, fontWeight: 700, background: '#eef6f2' }}>{f.stock_actual}</td>
            </tr>
          ))}
          {/* Totales */}
          <tr style={trTotal}>
            <td style={{ ...tdC, textAlign: 'right' as const, fontWeight: 700 }} colSpan={2}>TOTALES</td>
            <td style={tdTotal}>{totales.fondo}</td>
            <td style={tdTotal}>{totales.recibido}</td>
            <td style={tdTotal}>{totales.util_m}</td>
            <td style={tdTotal}>{totales.vales_m}</td>
            <td style={tdTotal}>{totales.util_v}</td>
            <td style={tdTotal}>{totales.vales_v}</td>
            <td style={tdTotal}>{totales.util_n}</td>
            <td style={tdTotal}>{totales.vales_n}</td>
            <td style={tdTotal}>{totales.stock}</td>
          </tr>
        </tbody>
      </table>
      <div style={nota}>
        <strong>Utilizado:</strong> salidas por vale canjeado. · <strong>Vales:</strong> vales aprobados pendientes de canje. ·
        <strong> Stock final</strong> = fondo fijo + recibido − utilizado − surtido.
      </div>

      {/* DETALLE DE VALES DEL DÍA */}
      <div style={subTitulo}>DETALLE DE VALES DEL DÍA</div>
      <table style={tablaDet}>
        <thead>
          <tr>
            <th style={thDet}>Folio</th>
            <th style={thDet}>Folio salida</th>
            <th style={thDet}>Turno</th>
            <th style={thDet}>Cama</th>
            <th style={{ ...thDet, minWidth: 100 }}>Nombre del Paciente</th>
            <th style={thDet}>Género</th>
            <th style={thDet}>No. Exp</th>
            <th style={{ ...thDet, minWidth: 90 }}>Diagnóstico</th>
            <th style={thDet}>Serv.</th>
            <th style={{ ...thDet, minWidth: 90 }}>Medicamento</th>
            <th style={thDet}>Cant.</th>
            <th style={{ ...thDet, minWidth: 80 }}>Médico</th>
            <th style={{ ...thDet, minWidth: 90 }}>Enfermero solicita</th>
            <th style={{ ...thDet, minWidth: 80 }}>Supervisora</th>
            <th style={thDet}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {detalle.length === 0 ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={`vacio-${i}`} style={trVacio}>
                {Array.from({ length: 15 }).map((__, j) => <td key={j} style={tdDet}>&nbsp;</td>)}
              </tr>
            ))
          ) : (
            detalle.map(d => (
              <tr key={d.receta_id}>
                <td style={tdDet}>{d.folio}</td>
                <td style={tdDet}>{d.folio_salida || '—'}</td>
                <td style={tdDet}>{d.turno}</td>
                <td style={tdDet}>{d.paciente_cama}</td>
                <td style={tdDet}>{d.paciente_nombre}</td>
                <td style={tdDet}>{d.paciente_genero}</td>
                <td style={tdDet}>{d.no_expediente || '—'}</td>
                <td style={tdDet}>{d.paciente_diagnostico}</td>
                <td style={tdDet}>{d.servicio_codigo}</td>
                <td style={tdDet}>{d.medicamento_nombre}</td>
                <td style={tdDet}>{d.cantidad_numero}</td>
                <td style={tdDet}>{d.medico_nombre}</td>
                <td style={tdDet}>{d.enfermero_solicita}</td>
                <td style={tdDet}>{d.supervisora || '—'}</td>
                <td style={tdDet}>{d.estado_aprobacion}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* FIRMAS DE ENTREGA / RECIBE */}
      <div style={firmas}>
        <div style={firmaCol}>
          <div style={firmaLinea} />
          <div style={firmaLabel}>ENTREGA</div>
          <div style={firmaSub}>Supervisión de Enfermería · Nombre y firma</div>
        </div>
        <div style={firmaCol}>
          <div style={firmaLinea} />
          <div style={firmaLabel}>RECIBE</div>
          <div style={firmaSub}>Responsable que recibe el fondo fijo · Nombre y firma</div>
        </div>
      </div>

      <div style={pie}>
        Documento generado desde el Sistema de Censo Hospitalario · Hoja diaria del fondo fijo · {fecha} ·
        {detalle.length} vale{detalle.length !== 1 ? 's' : ''} del día. Conserve junto con las recetas individuales para auditoría.
      </div>
    </div>
  );
};

// ============================================================
const pagina: React.CSSProperties = {
  width: '263mm', minHeight: '199mm', margin: '0 auto', background: '#fff',
  padding: '8mm', boxSizing: 'border-box', fontFamily: '"Times New Roman", Georgia, serif',
  color: '#000', fontSize: 8.5,
};
const barra: React.CSSProperties = { position: 'fixed' as const, top: 8, right: 8, display: 'flex', gap: 8, zIndex: 10 };
const btnImp: React.CSSProperties = { background: '#0E6755', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontFamily: 'sans-serif' };
const btnCer: React.CSSProperties = { background: '#888', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'sans-serif' };

const metaFila: React.CSSProperties = { display: 'flex', gap: 16, flexWrap: 'wrap' as const, padding: '4px 6px', background: '#f5f5f5', border: '1px solid #ccc', marginBottom: 6, fontSize: 8 };

const subTitulo: React.CSSProperties = { background: 'transparent', color: '#0E6755', textAlign: 'center' as const, padding: '3px 0', margin: '6px 0 3px', fontWeight: 700, fontSize: 10, letterSpacing: 0.4, borderTop: '1px solid #0E6755', borderBottom: '1px solid #0E6755' };

const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' as const, fontSize: 8, marginBottom: 3 };
const th: React.CSSProperties = { background: '#f5f1e8', color: '#7d5b2f', padding: '3px 4px', textAlign: 'center' as const, fontWeight: 700, fontSize: 8, border: '0.8px solid #888' };
const thTurno: React.CSSProperties = { color: '#fff', padding: '2px', textAlign: 'center' as const, fontWeight: 700, fontSize: 8, border: '0.8px solid #888' };
const thMini: React.CSSProperties = { background: '#f5f1e8', padding: '2px', textAlign: 'center' as const, fontWeight: 600, fontSize: 7, color: '#7d5b2f', border: '0.5px solid #aaa' };
const trAlt: React.CSSProperties = { background: '#fafafa' };
const trTotal: React.CSSProperties = { background: '#f5f1e8', fontWeight: 700 };
const tdNombre: React.CSSProperties = { padding: '3px 4px', textAlign: 'left' as const, border: '0.5px solid #ccc', verticalAlign: 'top' as const };
const tdC: React.CSSProperties = { padding: '3px 4px', textAlign: 'center' as const, border: '0.5px solid #ccc' };
const tdTotal: React.CSSProperties = { ...tdC, fontWeight: 700, background: '#eee' };
const nota: React.CSSProperties = { fontSize: 7, color: '#666', marginBottom: 4, fontStyle: 'italic' as const };

const tablaDet: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' as const, fontSize: 7.5 };
const thDet: React.CSSProperties = { background: '#f5f1e8', color: '#7d5b2f', padding: '2px 3px', textAlign: 'center' as const, fontWeight: 700, fontSize: 7.5, border: '0.8px solid #888' };
const tdDet: React.CSSProperties = { padding: '2px 3px', border: '0.5px solid #ccc', fontSize: 7.5, verticalAlign: 'top' as const, textAlign: 'center' as const };
const trVacio: React.CSSProperties = { height: 16 };

const firmas: React.CSSProperties = { display: 'flex', justifyContent: 'space-around', gap: 40, marginTop: 26, marginBottom: 6 };
const firmaCol: React.CSSProperties = { flex: 1, maxWidth: 320, textAlign: 'center' as const };
const firmaLinea: React.CSSProperties = { borderTop: '1px solid #000', marginBottom: 3 };
const firmaLabel: React.CSSProperties = { fontWeight: 700, fontSize: 9, color: '#0E6755' };
const firmaSub: React.CSSProperties = { fontSize: 7, color: '#666' };

const pie: React.CSSProperties = { marginTop: 6, fontSize: 7, color: '#666', borderTop: '1px solid #ccc', paddingTop: 4, textAlign: 'center' as const, fontStyle: 'italic' as const };
