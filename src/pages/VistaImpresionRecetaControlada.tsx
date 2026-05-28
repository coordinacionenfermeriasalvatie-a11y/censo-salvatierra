// Vista de impresión de receta de medicamento controlado.
// Ruta: /imprimir/receta-controlada/:id
// Header oficial IMSS-Bienestar + CLUES. Tamaño carta vertical.

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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
    if (receta) setTimeout(() => window.print(), 300);
  }, [receta]);

  if (error) return <div style={{ padding: 40, color: '#A32D2D' }}>Error: {error}</div>;
  if (!receta) return <div style={{ padding: 40 }}>Cargando receta...</div>;

  const fecha = new Date(receta.creado_en);
  const fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const horaStr = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={pagina}>
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        @media screen {
          body { background: #ccc; }
        }
      `}</style>

      <div className="no-print" style={barraSuperior}>
        <button onClick={() => window.print()} style={btnImprimir}>🖨️ Imprimir</button>
        <button onClick={() => window.close()} style={btnCerrar}>✕ Cerrar</button>
      </div>

      {/* HEADER OFICIAL */}
      <div style={headerOficial}>
        <div style={instituciones}>SECRETARÍA DE SALUD · IMSS-BIENESTAR</div>
        <div style={hospitalNombre}>BENEMÉRITO HOSPITAL GENERAL CON ESPECIALIDADES</div>
        <div style={hospitalSubNombre}>"JUAN MARÍA DE SALVATIERRA"</div>
        <div style={clues}>CLUES: BSIMB000672 · La Paz, Baja California Sur</div>
      </div>

      {/* TÍTULO DE LA RECETA */}
      <div style={tituloRecuadro}>
        <div style={tituloPrincipal}>RECETA DE MEDICAMENTO CONTROLADO</div>
        <div style={tituloGrupo}>{GRUPO_LABEL[receta.medicamento_grupo] || `GRUPO ${receta.medicamento_grupo}`}</div>
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
          <Campo label="NSS / Expediente" valor={receta.paciente_nss_curp ?? '—'} />
          <Campo label="Servicio" valor={receta.paciente_subservicio ?? '—'} />
          <Campo label="Cama" valor={receta.paciente_cama ?? '—'} />
          <Campo label="Diagnóstico de ingreso" valor={receta.paciente_diagnostico ?? '—'} spanFull />
        </div>
      </div>

      {/* MEDICAMENTO */}
      <div style={bloque}>
        <div style={bloqueHeader}>MEDICAMENTO PRESCRITO</div>
        <div style={bloqueGrid}>
          <Campo label="Medicamento" valor={receta.medicamento_nombre} spanFull />
          <Campo label="Dosis" valor={receta.dosis ?? '—'} />
          <Campo label="Vía" valor={receta.via ?? '—'} />
          <Campo label="Frecuencia" valor={receta.frecuencia ?? '—'} />
          <Campo label="Duración" valor={receta.duracion ?? '—'} />
          <Campo label="Cantidad (número)" valor={receta.cantidad_numero ?? '—'} />
          <Campo label="Cantidad (letra)" valor={receta.cantidad_letra ?? '—'} />
          {receta.indicaciones && (
            <Campo label="Indicaciones adicionales" valor={receta.indicaciones} spanFull />
          )}
        </div>
      </div>

      {/* FIRMAS */}
      <div style={firmasFila}>
        <div style={firmaCol}>
          <div style={firmaLinea} />
          <div style={firmaNombre}>{receta.medico_nombre ?? '—'}</div>
          <div style={firmaDetalle}>Cédula profesional: {receta.medico_cedula ?? '—'}</div>
          {receta.medico_especialidad && (
            <div style={firmaDetalle}>{receta.medico_especialidad}</div>
          )}
          <div style={firmaRol}>MÉDICO PRESCRIPTOR</div>
        </div>

        <div style={firmaCol}>
          <div style={firmaLinea} />
          <div style={firmaNombre}>{receta.enfermera_nombre}</div>
          <div style={firmaDetalle}>Matrícula: {receta.enfermera_matricula ?? '—'}</div>
          {receta.enfermera_rol && (
            <div style={firmaDetalle}>{receta.enfermera_rol.toUpperCase()}</div>
          )}
          <div style={firmaRol}>PERSONAL DE ENFERMERÍA</div>
        </div>
      </div>

      {/* PIE */}
      <div style={piePagina}>
        Receta válida únicamente con folio, firma y sello. Registro electrónico en el Sistema de Censo Hospitalario.
        <br />
        Documento generado el {fechaStr} {horaStr} · Folio {receta.folio} · CLUES BSIMB000672
      </div>
    </div>
  );
};

const Campo: React.FC<{ label: string; valor: string; spanFull?: boolean }> = ({ label, valor, spanFull }) => (
  <div style={{ ...campoBox, gridColumn: spanFull ? '1 / -1' : undefined }}>
    <div style={campoLbl}>{label}</div>
    <div style={campoVal}>{valor || '—'}</div>
  </div>
);

// ============================================================
const pagina: React.CSSProperties = {
  width: '210mm', minHeight: '275mm', margin: '0 auto', background: '#fff', padding: '12mm',
  boxSizing: 'border-box', fontFamily: '"Times New Roman", Georgia, serif', color: '#000', fontSize: 11,
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
const headerOficial: React.CSSProperties = {
  textAlign: 'center', borderBottom: '3px double #0E6755', paddingBottom: 8, marginBottom: 10,
};
const instituciones: React.CSSProperties = { fontSize: 10, color: '#444', letterSpacing: 1 };
const hospitalNombre: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#0E6755', marginTop: 4 };
const hospitalSubNombre: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#0E6755' };
const clues: React.CSSProperties = { fontSize: 10, color: '#7d5b2f', marginTop: 4, fontStyle: 'italic' };

const tituloRecuadro: React.CSSProperties = {
  background: '#A32D2D', color: '#fff', textAlign: 'center', padding: '8px 0', marginBottom: 10, borderRadius: 4,
};
const tituloPrincipal: React.CSSProperties = { fontSize: 14, fontWeight: 700, letterSpacing: 1 };
const tituloGrupo: React.CSSProperties = { fontSize: 11, fontWeight: 600, marginTop: 2, letterSpacing: 0.5 };

const folioFila: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: '#f5f5f5',
  border: '1px solid #ccc', borderRadius: 4, fontSize: 11, marginBottom: 10,
};
const folioVal: React.CSSProperties = { fontFamily: 'monospace', background: '#fff', padding: '1px 6px', border: '1px solid #ccc', borderRadius: 3 };

const bloque: React.CSSProperties = { border: '1.5px solid #0E6755', borderRadius: 4, marginBottom: 10 };
const bloqueHeader: React.CSSProperties = {
  background: '#0E6755', color: '#fff', padding: '5px 10px', fontWeight: 700, fontSize: 11, letterSpacing: 0.5,
};
const bloqueGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, padding: 8,
};
const campoBox: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px dashed #eee' };
const campoLbl: React.CSSProperties = { fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 };
const campoVal: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#000', marginTop: 1 };

const firmasFila: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, marginTop: 30, marginBottom: 20,
};
const firmaCol: React.CSSProperties = { textAlign: 'center' };
const firmaLinea: React.CSSProperties = { borderTop: '1px solid #000', marginBottom: 6 };
const firmaNombre: React.CSSProperties = { fontWeight: 700, fontSize: 11, textTransform: 'uppercase' };
const firmaDetalle: React.CSSProperties = { fontSize: 10, color: '#444', marginTop: 2 };
const firmaRol: React.CSSProperties = { fontSize: 9, color: '#7d5b2f', marginTop: 4, letterSpacing: 1, fontWeight: 600 };

const piePagina: React.CSSProperties = {
  borderTop: '1px solid #ccc', paddingTop: 6, marginTop: 16, fontSize: 9, color: '#666', textAlign: 'center', lineHeight: 1.4,
};
