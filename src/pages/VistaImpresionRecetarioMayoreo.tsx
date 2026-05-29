// Vista de impresión del recetario colectivo "a mayoreo".
// Ruta: /imprimir/recetario-mayoreo/:id
// Carta vertical, una sola hoja: encabezado oficial, folio/fecha,
// servicio/área, tabla de medicamentos solicitados a granel y firmas.
// ?preview=1 → modo embebido (iframe del modal): no imprime solo.

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatearRol } from '../types';
import { EncabezadoOficial } from './components/EncabezadoOficial';

interface Cabecera {
  id: string;
  folio: string;
  creado_en: string;
  servicio_nombre: string;
  area: string | null;
  observaciones: string | null;
  solicitante_nombre: string;
  solicitante_matricula: string | null;
  solicitante_rol: string | null;
}

interface Item {
  id: string;
  orden: number;
  medicamento_nombre: string;
  dosis: string | null;
  via: string | null;
  frecuencia: string | null;
  cantidad: string | null;
}

export const VistaImpresionRecetarioMayoreo: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const preview = searchParams.get('preview') === '1';
  const [cab, setCab] = useState<Cabecera | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [cabRes, itemsRes] = await Promise.all([
        supabase.from('recetas_colectivas_mayoreo').select('*').eq('id', id).single(),
        supabase.from('recetas_colectivas_mayoreo_items').select('*').eq('receta_id', id).order('orden'),
      ]);
      if (cabRes.error) { setError(cabRes.error.message); return; }
      setCab(cabRes.data as Cabecera);
      setItems((itemsRes.data || []) as Item[]);
    })();
  }, [id]);

  useEffect(() => {
    if (cab && !preview) setTimeout(() => window.print(), 300);
  }, [cab, preview]);

  if (error) return <div style={{ padding: 40, color: '#A32D2D' }}>Error: {error}</div>;
  if (!cab) return <div style={{ padding: 40 }}>Cargando solicitud...</div>;

  const fecha = new Date(cab.creado_en);
  const fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const horaStr = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  // Mínimo de renglones para que la hoja se vea completa aunque haya pocos.
  const MIN_FILAS = 12;
  const filasVacias = Math.max(0, MIN_FILAS - items.length);

  return (
    <div style={pagina}>
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        @media screen { body { background: #ccc; } }
      `}</style>

      {!preview && (
        <div className="no-print" style={barraSuperior}>
          <button onClick={() => window.print()} style={btnImprimir}>🖨️ Imprimir</button>
          <button onClick={() => window.close()} style={btnCerrar}>✕ Cerrar</button>
        </div>
      )}

      <div style={hoja}>
        {/* ENCABEZADO INSTITUCIONAL UNIFICADO */}
        <EncabezadoOficial formato="SOLICITUD DE MEDICAMENTOS A MAYOREO" />

        {/* SUBTÍTULO */}
        <div style={tituloRecuadro}>
          <div style={tituloSub}>Recetario colectivo · solicitud a granel (no por paciente)</div>
        </div>

        {/* FOLIO Y FECHA */}
        <div style={folioFila}>
          <div><strong>FOLIO:</strong> <span style={folioVal}>{cab.folio}</span></div>
          <div><strong>FECHA:</strong> {fechaStr} · {horaStr}</div>
        </div>

        {/* SERVICIO / ÁREA */}
        <div style={metaFila}>
          <div style={metaCampo}><span style={metaLbl}>SERVICIO</span><span style={metaVal}>{cab.servicio_nombre}</span></div>
          <div style={metaCampo}><span style={metaLbl}>ÁREA / SUBSERVICIO</span><span style={metaVal}>{cab.area || '—'}</span></div>
        </div>

        {/* TABLA DE MEDICAMENTOS */}
        <table style={tabla}>
          <thead>
            <tr>
              <th style={{ ...th, width: '5%' }}>#</th>
              <th style={{ ...th, width: '43%', textAlign: 'left' }}>MEDICAMENTO</th>
              <th style={{ ...th, width: '15%' }}>DOSIS</th>
              <th style={{ ...th, width: '10%' }}>VÍA</th>
              <th style={{ ...th, width: '15%' }}>FRECUENCIA</th>
              <th style={{ ...th, width: '12%' }}>CANTIDAD</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} style={i % 2 === 0 ? rowPar : rowImpar}>
                <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{i + 1}</td>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{it.medicamento_nombre}</td>
                <td style={tdC}>{it.dosis || '—'}</td>
                <td style={tdC}>{it.via || '—'}</td>
                <td style={tdC}>{it.frecuencia || '—'}</td>
                <td style={{ ...tdC, fontWeight: 700 }}>{it.cantidad || '—'}</td>
              </tr>
            ))}
            {Array.from({ length: filasVacias }).map((_, i) => (
              <tr key={`v${i}`} style={(items.length + i) % 2 === 0 ? rowPar : rowImpar}>
                <td style={{ ...td, textAlign: 'center', color: '#bbb' }}>{items.length + i + 1}</td>
                <td style={td}>&nbsp;</td>
                <td style={tdC}>&nbsp;</td>
                <td style={tdC}>&nbsp;</td>
                <td style={tdC}>&nbsp;</td>
                <td style={tdC}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* OBSERVACIONES */}
        <div style={obsBox}>
          <div style={obsLbl}>OBSERVACIONES</div>
          <div style={obsVal}>{cab.observaciones || ' '}</div>
        </div>

        {/* FIRMAS */}
        <div style={firmasFila}>
          <div style={firmaCol}>
            <div style={firmaLinea} />
            <div style={firmaNombre}>{cab.solicitante_nombre}</div>
            <div style={firmaDetalle}>
              Matrícula: {cab.solicitante_matricula ?? '—'}
              {cab.solicitante_rol ? ` · ${formatearRol(cab.solicitante_rol)}` : ''}
            </div>
            <div style={firmaRol}>ENFERMERÍA QUE SOLICITA</div>
          </div>
          <div style={firmaCol}>
            <div style={firmaLinea} />
            <div style={firmaNombre}>&nbsp;</div>
            <div style={firmaDetalle}>Nombre y matrícula</div>
            <div style={firmaRol}>SUPERVISIÓN QUE AUTORIZA</div>
          </div>
          <div style={firmaCol}>
            <div style={firmaLinea} />
            <div style={firmaNombre}>&nbsp;</div>
            <div style={firmaDetalle}>Nombre y firma</div>
            <div style={firmaRol}>FARMACIA QUE SURTE</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
const pagina: React.CSSProperties = {
  width: '216mm', minHeight: '279mm', margin: '0 auto', background: '#fff', padding: '8mm',
  boxSizing: 'border-box', fontFamily: '"Times New Roman", Georgia, serif', color: '#000', fontSize: 10,
};
const barraSuperior: React.CSSProperties = { position: 'fixed', top: 8, right: 8, display: 'flex', gap: 8, zIndex: 10 };
const btnImprimir: React.CSSProperties = { background: '#0E6755', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontFamily: 'sans-serif' };
const btnCerrar: React.CSSProperties = { background: '#888', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'sans-serif' };

const hoja: React.CSSProperties = { border: '1px solid #999', borderRadius: 4, padding: '6mm', background: '#fff' };

const headerOficial: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 10,
  borderBottom: '1.2px solid #0E6755', paddingBottom: 5, marginBottom: 6,
};
const headerTexto: React.CSSProperties = { textAlign: 'center', minWidth: 0, lineHeight: 1.2 };
const logoIzq: React.CSSProperties = { height: 38, width: 'auto', objectFit: 'contain', display: 'block', justifySelf: 'start' };
const logoDer: React.CSSProperties = { height: 38, width: 'auto', objectFit: 'contain', display: 'block', justifySelf: 'end' };
const hospitalNombre: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#0E6755', letterSpacing: 0.3 };
const hospitalSubNombre: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#0E6755', marginTop: 1 };
const clues: React.CSSProperties = { fontSize: 7.5, color: '#555', marginTop: 1, fontStyle: 'italic' };
const coordinacion: React.CSSProperties = { fontSize: 8.5, fontWeight: 700, color: '#7d5b2f', marginTop: 2, letterSpacing: 0.4 };

const tituloRecuadro: React.CSSProperties = { background: '#fff', color: '#0E6755', textAlign: 'center', padding: '5px 6px', border: '1.2px solid #0E6755', borderRadius: 3, marginBottom: 6 };
const tituloPrincipal: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 0.5 };
const tituloSub: React.CSSProperties = { fontSize: 9, fontWeight: 600, marginTop: 1, opacity: 0.95 };

const folioFila: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: '#f5f5f5',
  border: '1px solid #ccc', borderRadius: 3, fontSize: 10, marginBottom: 6,
};
const folioVal: React.CSSProperties = { fontFamily: 'monospace', background: '#fff', padding: '0 4px', border: '1px solid #ccc', borderRadius: 2 };

const metaFila: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 };
const metaCampo: React.CSSProperties = { border: '1px solid #0E6755', borderRadius: 3, padding: '3px 8px', display: 'flex', flexDirection: 'column' };
const metaLbl: React.CSSProperties = { fontSize: 7.5, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 };
const metaVal: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#000' };

const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 10, marginBottom: 6 };
const th: React.CSSProperties = { background: '#fff', color: '#0E6755', padding: '4px 5px', fontWeight: 700, fontSize: 9, border: '1px solid #0E6755', textAlign: 'center', letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: '4px 6px', border: '1px solid #c9c9c9', fontSize: 10, height: 18 };
const tdC: React.CSSProperties = { ...td, textAlign: 'center' };
const rowPar: React.CSSProperties = { background: '#fff' };
const rowImpar: React.CSSProperties = { background: '#f5f5f5' };

const obsBox: React.CSSProperties = { border: '1px solid #0E6755', borderRadius: 3, marginBottom: 14, minHeight: 36 };
const obsLbl: React.CSSProperties = { background: '#fff', color: '#0E6755', padding: '2px 8px', fontWeight: 700, fontSize: 9, letterSpacing: 0.5, borderBottom: '1px solid #0E6755' };
const obsVal: React.CSSProperties = { padding: '4px 8px', fontSize: 10, whiteSpace: 'pre-wrap' };

const firmasFila: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 22 };
const firmaCol: React.CSSProperties = { textAlign: 'center' };
const firmaLinea: React.CSSProperties = { borderTop: '1px solid #000', marginBottom: 3 };
const firmaNombre: React.CSSProperties = { fontWeight: 700, fontSize: 9.5, textTransform: 'uppercase', minHeight: 12 };
const firmaDetalle: React.CSSProperties = { fontSize: 8.5, color: '#444', marginTop: 1 };
const firmaRol: React.CSSProperties = { fontSize: 8, color: '#7d5b2f', marginTop: 2, letterSpacing: 0.8, fontWeight: 600 };
