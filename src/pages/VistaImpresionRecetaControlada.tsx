// Vista de impresión de receta de medicamento controlado.
// Ruta: /imprimir/receta-controlada/:id
// Carta vertical con 2 boletas idénticas por hoja:
//   - Superior: Original · Jefatura de Enfermería (badge guinda)
//   - Inferior: Copia · Supervisión de Enfermería (badge dorado)
// Entre ambas, línea de corte punteada.

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatearRol } from '../types';

interface Receta {
  id: string;
  folio: string;
  creado_en: string;
  paciente_nombre: string;
  paciente_edad: number | null;
  paciente_edad_unidad: string | null;
  paciente_genero: string | null;
  paciente_nss_curp: string | null;
  paciente_diagnostico: string | null;
  paciente_cama: string | null;
  paciente_subservicio: string | null;
  medicamento_nombre: string;
  medicamento_grupo: string;
  dosis: string | null;
  via: string | null;
  frecuencia: string | null;
  duracion: string | null;
  cantidad_numero: string | null;
  cantidad_letra: string | null;
  indicaciones: string | null;
  medico_nombre: string | null;
  medico_cedula: string | null;
  medico_especialidad: string | null;
  enfermera_nombre: string;
  enfermera_matricula: string | null;
  enfermera_rol: string | null;
}

const GRUPO_LABEL: Record<string, string> = {
  'I':   'GRUPO I — ESTUPEFACIENTES',
  'II':  'GRUPO II — PSICOTRÓPICOS POTENTES',
  'III': 'GRUPO III — PSICOTRÓPICOS',
  'IV':  'GRUPO IV',
  'V':   'GRUPO V',
};

export const VistaImpresionRecetaControlada: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  // ?preview=1 → modo vista previa embebida (iframe en el modal): NO imprime
  // automáticamente y oculta la barra de acciones flotante.
  const [searchParams] = useSearchParams();
  const preview = searchParams.get('preview') === '1';
  const [receta, setReceta] = useState<Receta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const { data, error: err } = await supabase
        .from('recetas_controladas')
        .select('*')
        .eq('id', id)
        .single();
      if (err) setError(err.message);
      else setReceta(data as Receta);
    })();
  }, [id]);

  useEffect(() => {
    if (receta && !preview) setTimeout(() => window.print(), 300);
  }, [receta, preview]);

  if (error) return <div style={{ padding: 40, color: '#A32D2D' }}>Error: {error}</div>;
  if (!receta) return <div style={{ padding: 40 }}>Cargando receta...</div>;

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

      <Boleta receta={receta} tipo="original" />
      <LineaCorte />
      <Boleta receta={receta} tipo="copia" />
    </div>
  );
};

// ============================================================
// BOLETA INDIVIDUAL
// ============================================================
const Boleta: React.FC<{ receta: Receta; tipo: 'original' | 'copia' }> = ({ receta, tipo }) => {
  const fecha = new Date(receta.creado_en);
  const fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const horaStr = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const badge = tipo === 'original'
    ? { texto: 'ORIGINAL · JEFATURA DE ENFERMERÍA', color: '#7d0a2e', fg: '#fff' }
    : { texto: 'COPIA · SUPERVISIÓN DE ENFERMERÍA', color: '#C39C59', fg: '#fff' };

  return (
    <div style={boleta}>
      {/* HEADER OFICIAL CON LOGOS — SIN FONDOS DE COLOR */}
      <div style={headerOficial}>
        <img src="/logos/salud_imss_bienestar.png" alt="SALUD · Servicios de Salud · IMSS-Bienestar" style={logoIzq} />
        <div style={headerTexto}>
          <div style={hospitalNombre}>BENEMÉRITO HOSPITAL GENERAL CON ESPECIALIDADES IMSS-BIENESTAR</div>
          <div style={hospitalSubNombre}>"JUAN MARÍA DE SALVATIERRA"</div>
          <div style={clues}>CLUES: BSIMB000672 · La Paz, Baja California Sur</div>
          <div style={coordinacion}>COORDINACIÓN DE ENFERMERÍA</div>
        </div>
        <img src="/logos/LOGO_HOSPITAL.png" alt='Benemérito Hospital General con Especialidades IMSS-Bienestar "Juan María de Salvatierra"' style={logoDer} />
      </div>

      {/* TÍTULO Y BADGE */}
      <div style={tituloFila}>
        <div style={tituloRecuadro}>
          <div style={tituloPrincipal}>SOLICITUD DE MEDICAMENTO CONTROLADO</div>
          <div style={tituloGrupo}>{GRUPO_LABEL[receta.medicamento_grupo] || `GRUPO ${receta.medicamento_grupo}`}</div>
        </div>
        <div style={{ ...badgeStyle, background: badge.color, color: badge.fg }}>{badge.texto}</div>
      </div>

      {/* FOLIO Y FECHA */}
      <div style={folioFila}>
        <div><strong>FOLIO:</strong> <span style={folioVal}>{receta.folio}</span></div>
        <div><strong>FECHA:</strong> {fechaStr} · {horaStr}</div>
      </div>

      {/* PACIENTE */}
      <div style={bloque}>
        <div style={bloqueHeader}>DATOS DEL PACIENTE</div>
        <div style={bloqueGrid}>
          <Campo label="Nombre completo" valor={receta.paciente_nombre} spanFull />
          <Campo label="Edad" valor={`${receta.paciente_edad ?? '—'} ${receta.paciente_edad_unidad ?? ''}`} />
          <Campo label="Sexo" valor={receta.paciente_genero ?? '—'} />
          <Campo label="NSS / Exp" valor={receta.paciente_nss_curp ?? '—'} />
          <Campo label="Servicio" valor={receta.paciente_subservicio ?? '—'} />
          <Campo label="Cama" valor={receta.paciente_cama ?? '—'} />
          <Campo label="Diagnóstico" valor={receta.paciente_diagnostico ?? '—'} spanFull />
        </div>
      </div>

      {/* MEDICAMENTO */}
      <div style={bloque}>
        <div style={bloqueHeader}>MEDICAMENTO</div>
        <div style={bloqueGrid}>
          <Campo label="Medicamento" valor={receta.medicamento_nombre} spanFull />
          <Campo label="Dosis" valor={receta.dosis ?? '—'} />
          <Campo label="Vía" valor={receta.via ?? '—'} />
          <Campo label="Frecuencia" valor={receta.frecuencia ?? '—'} />
          <Campo label="Duración" valor={receta.duracion ?? '—'} />
          <Campo label="Cantidad N°" valor={receta.cantidad_numero ?? '—'} />
          <Campo label="Cantidad letra" valor={receta.cantidad_letra ?? '—'} />
          {receta.indicaciones && (
            <Campo label="Indicaciones" valor={receta.indicaciones} spanFull />
          )}
        </div>
      </div>

      {/* FIRMAS */}
      <div style={firmasFila}>
        <div style={firmaCol}>
          <div style={firmaLinea} />
          <div style={firmaNombre}>{receta.medico_nombre ?? '—'}</div>
          <div style={firmaDetalle}>Céd. prof.: {receta.medico_cedula ?? '—'}{receta.medico_especialidad ? ` · ${receta.medico_especialidad}` : ''}</div>
          <div style={firmaRol}>MÉDICO PRESCRIPTOR</div>
        </div>

        <div style={firmaCol}>
          <div style={firmaLinea} />
          <div style={firmaNombre}>{receta.enfermera_nombre}</div>
          <div style={firmaDetalle}>Matrícula: {receta.enfermera_matricula ?? '—'}{receta.enfermera_rol ? ` · ${formatearRol(receta.enfermera_rol)}` : ''}</div>
          <div style={firmaRol}>ENFERMERA QUE SOLICITA</div>
        </div>

        <div style={firmaCol}>
          <div style={firmaLinea} />
          <div style={firmaNombre}>&nbsp;</div>
          <div style={firmaDetalle}>Nombre y matrícula</div>
          <div style={firmaRol}>SUPERVISORA QUE ENTREGA</div>
        </div>
      </div>
    </div>
  );
};

const LineaCorte: React.FC = () => (
  <div style={lineaCorteContenedor}>
    <span style={lineaCorteIzq} />
    <span style={lineaCorteTexto}>✂ Línea de corte — Ambas copias deben llenarse con los MISMOS datos y firmas para canje de medicamento</span>
    <span style={lineaCorteDer} />
  </div>
);

const Campo: React.FC<{ label: string; valor: string; spanFull?: boolean }> = ({ label, valor, spanFull }) => (
  <div style={{ ...campoBox, gridColumn: spanFull ? '1 / -1' : undefined }}>
    <div style={campoLbl}>{label}</div>
    <div style={campoVal}>{valor || '—'}</div>
  </div>
);

// ============================================================
const pagina: React.CSSProperties = {
  width: '216mm', minHeight: '279mm', margin: '0 auto', background: '#fff', padding: '8mm',
  boxSizing: 'border-box', fontFamily: '"Times New Roman", Georgia, serif', color: '#000', fontSize: 9.5,
};
const barraSuperior: React.CSSProperties = {
  position: 'fixed', top: 8, right: 8, display: 'flex', gap: 8, zIndex: 10,
};
const btnImprimir: React.CSSProperties = {
  background: '#0E6755', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontFamily: 'sans-serif',
};
const btnCerrar: React.CSSProperties = {
  background: '#888', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'sans-serif',
};

const boleta: React.CSSProperties = {
  border: '1px solid #999', borderRadius: 4, padding: '6mm', background: '#fff',
};

const headerOficial: React.CSSProperties = {
  // Columnas 'auto' = se ajustan al ancho natural de cada logo; el centro (1fr)
  // toma el resto. Así los logos crecen sin recortarse ni invadir el texto.
  display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 10,
  borderBottom: '1.2px solid #0E6755', paddingBottom: 5, marginBottom: 6,
};
const headerTexto: React.CSSProperties = { textAlign: 'center', minWidth: 0, lineHeight: 1.2 };
// Logos a la misma ALTURA (38px, más grandes); el ancho lo da la relación de
// aspecto real (salud 7.48:1, hospital 4.57:1) para que no se deformen.
const logoIzq: React.CSSProperties = {
  height: 38, width: 'auto',
  objectFit: 'contain' as const, display: 'block', justifySelf: 'start' as const,
};
const logoDer: React.CSSProperties = {
  height: 38, width: 'auto',
  objectFit: 'contain' as const, display: 'block', justifySelf: 'end' as const,
};
const hospitalNombre: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#0E6755', letterSpacing: 0.3 };
const hospitalSubNombre: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#0E6755', marginTop: 1 };
const clues: React.CSSProperties = { fontSize: 7.5, color: '#555', marginTop: 1, fontStyle: 'italic' };
const coordinacion: React.CSSProperties = { fontSize: 8.5, fontWeight: 700, color: '#7d5b2f', marginTop: 2, letterSpacing: 0.4 };

const tituloFila: React.CSSProperties = {
  display: 'flex', gap: 6, alignItems: 'stretch', marginBottom: 6,
};
const tituloRecuadro: React.CSSProperties = {
  background: '#A32D2D', color: '#fff', textAlign: 'center', padding: '4px 6px', borderRadius: 3, flex: 1,
};
const tituloPrincipal: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.5 };
const tituloGrupo: React.CSSProperties = { fontSize: 9, fontWeight: 600, marginTop: 1 };
const badgeStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 3, fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
  display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', maxWidth: 130,
  lineHeight: 1.2,
};

const folioFila: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: '#f5f5f5',
  border: '1px solid #ccc', borderRadius: 3, fontSize: 9.5, marginBottom: 6,
};
const folioVal: React.CSSProperties = { fontFamily: 'monospace', background: '#fff', padding: '0 4px', border: '1px solid #ccc', borderRadius: 2 };

const bloque: React.CSSProperties = { border: '1px solid #0E6755', borderRadius: 3, marginBottom: 6 };
const bloqueHeader: React.CSSProperties = {
  background: '#0E6755', color: '#fff', padding: '3px 8px', fontWeight: 700, fontSize: 9.5, letterSpacing: 0.5,
};
const bloqueGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', padding: 4,
};
const campoBox: React.CSSProperties = { padding: '2px 4px', borderBottom: '1px dashed #eee' };
const campoLbl: React.CSSProperties = { fontSize: 7.5, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 };
const campoVal: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#000' };

const firmasFila: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 18, marginBottom: 4,
};
const firmaCol: React.CSSProperties = { textAlign: 'center' };
const firmaLinea: React.CSSProperties = { borderTop: '1px solid #000', marginBottom: 3 };
const firmaNombre: React.CSSProperties = { fontWeight: 700, fontSize: 9.5, textTransform: 'uppercase', minHeight: 12 };
const firmaDetalle: React.CSSProperties = { fontSize: 8.5, color: '#444', marginTop: 1 };
const firmaRol: React.CSSProperties = { fontSize: 8, color: '#7d5b2f', marginTop: 2, letterSpacing: 0.8, fontWeight: 600 };

const lineaCorteContenedor: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0',
};
const lineaCorteIzq: React.CSSProperties = {
  flex: 1, height: 0, borderTop: '1.5px dashed #888',
};
const lineaCorteDer: React.CSSProperties = {
  flex: 1, height: 0, borderTop: '1.5px dashed #888',
};
const lineaCorteTexto: React.CSSProperties = {
  fontSize: 8.5, color: '#666', fontStyle: 'italic' as const, padding: '0 8px', whiteSpace: 'nowrap' as const, fontFamily: 'sans-serif',
};
