// src/pages/VistaImpresionFicha.tsx
// Tarjeta de Identificación del paciente — formato institucional IMSS-Bienestar.
// Reproduce el diseño impreso del Hospital Juan María de Salvatierra.
//
// Ruta: /imprimir/ficha/:pacienteId
//
// Datos auto-llenados desde BD:
//   - Nombre, edad, sexo, fecha nacimiento (derivada de NSS DD/MM/AAAA o calculada
//     de la edad), número expediente, fecha y hora de ingreso
//   - Riesgo UPP y Riesgo Caídas desde formato_control_paciente
//
// Campos manuales (para llenar a mano sobre el papel impreso):
//   - Grupo y RH (la BD no lo guarda)
//   - Alergias (la BD no lo guarda)
//   - Escala del dolor (no se almacena por fecha en BD)
//   - Fecha de evaluación

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface FichaPaciente {
  id: string;
  nombre_paciente: string;
  edad: number | null;
  genero: string | null;
  nss_curp: string | null;
  diagnostico_ingreso: string | null;
  fecha_ingreso: string;
  hora_ingreso: string | null;
  riesgo_upp: string | null;
  riesgo_caidas: string | null;
}

export function VistaImpresionFicha() {
  const { pacienteId } = useParams<{ pacienteId: string }>();
  const navigate = useNavigate();
  const [paciente, setPaciente] = useState<FichaPaciente | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pacienteId) return;
    (async () => {
      const { data, error } = await supabase
        .from('pacientes')
        .select(`
          id, nombre_paciente, edad, genero, nss_curp, diagnostico_ingreso,
          fecha_ingreso, hora_ingreso,
          formato_control_paciente ( riesgo_upp, riesgo_caidas )
        `)
        .eq('id', pacienteId)
        .single();
      if (error) {
        setError(error.message);
        return;
      }
      const fc = Array.isArray(data.formato_control_paciente)
        ? data.formato_control_paciente[0]
        : data.formato_control_paciente;
      setPaciente({
        id: data.id,
        nombre_paciente: data.nombre_paciente,
        edad: data.edad,
        genero: data.genero,
        nss_curp: data.nss_curp,
        diagnostico_ingreso: data.diagnostico_ingreso,
        fecha_ingreso: data.fecha_ingreso,
        hora_ingreso: data.hora_ingreso,
        riesgo_upp: fc?.riesgo_upp || null,
        riesgo_caidas: fc?.riesgo_caidas || null,
      });
    })();
  }, [pacienteId]);

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: 'Arial', color: '#A32D2D' }}>
        <h2>Error al cargar la ficha</h2>
        <p>{error}</p>
        <button onClick={() => navigate(-1)}>Volver</button>
      </div>
    );
  }

  if (!paciente) {
    return (
      <div style={{ padding: 40, fontFamily: 'Arial' }}>
        <p>Cargando ficha...</p>
      </div>
    );
  }

  // Parsear NSS / fecha de nacimiento
  // - Si NSS tiene formato "DD/MM/YYYY" lo usamos como fecha de nacimiento
  // - Si NSS es número (6 dígitos) lo dejamos como expediente y calculamos
  //   fecha aproximada con la edad
  let fnacDD = '____';
  let fnacMM = '__________';
  let fnacAAAA = '______';
  let expediente = '______________';
  const MESES_LARGOS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  if (paciente.nss_curp) {
    const m = paciente.nss_curp.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      const d = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const y = parseInt(m[3], 10);
      fnacDD = String(d).padStart(2, '0');
      fnacMM = MESES_LARGOS[mo - 1] || '__________';
      fnacAAAA = String(y);
    } else {
      // Es número de expediente
      expediente = paciente.nss_curp;
      // Calcular año de nacimiento aproximado
      if (paciente.edad != null) {
        fnacAAAA = String(2026 - paciente.edad);
      }
    }
  }

  // Fecha y hora de ingreso
  const ingreso = new Date(paciente.fecha_ingreso + 'T00:00:00');
  const ingDD = String(ingreso.getDate()).padStart(2, '0');
  const ingMM = MESES_LARGOS[ingreso.getMonth()] || '';
  const ingAAAA = ingreso.getFullYear();
  const ingHora = (paciente.hora_ingreso || '').substring(0, 5);
  const [ingHH = '__', ingMin = '__'] = ingHora.split(':');

  // Riesgos
  const upp = (paciente.riesgo_upp || '').toUpperCase();
  const caidas = (paciente.riesgo_caidas || '').toUpperCase();

  // Hoy para "evaluación" (manual)
  const hoy = new Date();
  const evalDD = String(hoy.getDate()).padStart(2, '0');
  const evalMM = MESES_LARGOS[hoy.getMonth()];
  const evalAAAA = hoy.getFullYear();

  const sexo = (paciente.genero || '').startsWith('F') ? 'F' : 'M';

  return (
    <div className="ficha-page">
      {/* Barra superior (no se imprime) */}
      <div className="no-print" style={barraSuperior}>
        <button onClick={() => navigate(-1)} style={btnVolver}>← Volver</button>
        <span style={{ flex: 1, textAlign: 'center', color: '#666', fontSize: 13 }}>
          Tarjeta de identificación · {paciente.nombre_paciente}
        </span>
        <button onClick={() => window.print()} style={btnImprimir}>🖨️ Imprimir</button>
      </div>

      {/* TARJETA */}
      <div style={tarjeta}>
        {/* Encabezado: logos + título */}
        <div style={cabeza}>
          <img src="/logos/imss_bienestar.png" alt="IMSS-Bienestar" style={logoIzq} />
          <div style={titulo}>TARJETA DE IDENTIFICACIÓN</div>
          <img src="/logos/LOGO_HOSPITAL.jpg" alt="Hospital Salvatierra" style={logoDer} />
        </div>

        {/* Nombre */}
        <div style={filaNombre}>
          <span style={labelNombre}>NOMBRE:</span>
          <div style={cajaNombre}>{paciente.nombre_paciente}</div>
        </div>

        {/* Fecha de nacimiento */}
        <div style={filaFnac}>
          <span style={labelFnac}>FECHA DE NACIMIENTO:</span>
          <div style={cajaFnac}>
            <span style={{ flex: '0 0 60px', textAlign: 'center' }}>{fnacDD}</span>
            <span style={{ borderLeft: '1px solid #333' }}> </span>
            <span style={{ flex: 1, textAlign: 'center' }}>{fnacMM}</span>
            <span style={{ borderLeft: '1px solid #333' }}> </span>
            <span style={{ flex: '0 0 80px', textAlign: 'center' }}>{fnacAAAA}</span>
          </div>
        </div>

        {/* Fecha y hora ingreso */}
        <div style={filaIngreso}>
          FECHA Y HORA DE INGRESO:{' '}
          <span style={subrayado}>{ingDD}</span> / <span style={subrayado}>{ingMM}</span> / <span style={subrayado}>{ingAAAA}</span>
          {'     '}
          <span style={subrayado}>{ingHH}</span> : <span style={subrayado}>{ingMin}</span>
        </div>

        {/* EDAD / SEXO / EXPEDIENTE / GRUPO RH */}
        <div style={filaDatos}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            EDAD: <span style={subrayadoCorto}>{paciente.edad ?? ''}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            SEXO:
            <span style={{ ...cajaSexo, background: sexo === 'F' ? '#FFF5C2' : 'transparent' }}>F</span>
            <span style={{ ...cajaSexo, background: sexo === 'M' ? '#FFF5C2' : 'transparent' }}>M</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            NÚMERO EXPEDIENTE: <span style={subrayado}>{expediente}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            GRUPO Y RH: <span style={subrayadoCorto}>_________</span>
          </div>
        </div>

        {/* Alergias */}
        <div style={filaAlergias}>
          <strong>ALERGIAS:</strong>
          <span style={cajaNoSi}>NO</span>
          <span style={cajaNoSi}>SI</span>
          ¿CUÁLES?
          <span style={lineaLarga}>{' '}</span>
        </div>
        <div style={filaAlergiasSegunda}>
          <span style={lineaLarga}>{' '}</span>
        </div>

        {/* Subtítulo evaluación */}
        <div style={subtitEvaluacion}>
          <strong>EVALUACIÓN DEL PACIENTE</strong>{'    '}
          FECHA Y HORA:{' '}
          <span style={subrayado}>{evalDD}</span> / <span style={subrayado}>{evalMM}</span> / <span style={subrayado}>{evalAAAA}</span>
          {'     '}
          <span style={subrayadoCorto}>__</span> : <span style={subrayadoCorto}>__</span>
        </div>

        {/* Tres escalas visuales */}
        <div style={gridEscalas}>
          {/* RIESGO DE CAÍDA */}
          <div style={escalaCol}>
            <div style={escalaTitulo}>RIESGO DE CAÍDA</div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
              <Circulo color="#E84545" texto="ALTO" marcado={caidas === 'ALTO'} />
              <Circulo color="#F5C829" texto="MEDIANO" marcado={caidas === 'MEDIANO' || caidas === 'MEDIO'} />
              <Circulo color="#5CAB34" texto="BAJO" marcado={caidas === 'BAJO'} />
            </div>
          </div>

          {/* RIESGO DE ÚLCERA POR PRESIÓN */}
          <div style={escalaCol}>
            <div style={escalaTitulo}>RIESGO DE ÚLCERA POR PRESIÓN</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, alignItems: 'center' }}>
              <BarraRiesgo color="#E84545" texto="ALTO" marcado={upp === 'ALTO'} />
              <BarraRiesgo color="#F5C829" texto="MEDIANO" marcado={upp === 'MEDIANO' || upp === 'MEDIO'} />
              <BarraRiesgo color="#5CAB34" texto="BAJO" marcado={upp === 'BAJO'} />
            </div>
          </div>

          {/* ESCALA DEL DOLOR */}
          <div style={escalaCol}>
            <div style={escalaTitulo}>ESCALA DEL DOLOR</div>
            <div style={escalaDolor}>
              {[0,1,2,3,4,5,6,7,8,9,10].map(n => {
                const color = n <= 2 ? '#5CAB34' : n <= 4 ? '#A6CE39' : n <= 6 ? '#F5C829' : n <= 8 ? '#E89829' : '#E84545';
                return (
                  <div key={n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 9, fontWeight: 700 }}>{n}</div>
                    <div style={{ width: 14, height: 14, background: color, borderRadius: 2, border: '0.5px solid #555' }} />
                  </div>
                );
              })}
            </div>
            <div style={escalaDolorEtiquetas}>
              <span>Sin dolor</span>
              <span>Moderado</span>
              <span>Extremo</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @page { size: letter landscape; margin: 8mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        @media screen {
          .ficha-page {
            background: #F5F1E8;
            min-height: 100vh;
            padding: 40px 20px;
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTES
// ============================================================
function Circulo({ color, texto, marcado }: { color: string; texto: string; marcado: boolean }) {
  return (
    <div style={{
      width: 70, height: 70, borderRadius: '50%',
      background: color, color: '#fff', fontWeight: 800, fontSize: 11,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: marcado ? '4px solid #000' : '1px solid #555',
      boxShadow: marcado ? '0 0 0 3px rgba(0,0,0,0.15)' : 'none',
    }}>{texto}</div>
  );
}

function BarraRiesgo({ color, texto, marcado }: { color: string; texto: string; marcado: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        display: 'inline-block', width: 14, height: 14, border: '1.5px solid #333',
        background: marcado ? '#000' : '#fff',
      }} />
      <div style={{
        width: 140, padding: '4px 12px', background: color, color: '#fff',
        fontWeight: 700, fontSize: 11, textAlign: 'center', border: '1px solid #333',
      }}>{texto}</div>
    </div>
  );
}

// ============================================================
// ESTILOS
// ============================================================
const barraSuperior: React.CSSProperties = {
  position: 'sticky', top: 0, background: '#fff', padding: '10px 16px',
  display: 'flex', alignItems: 'center', gap: 12,
  borderBottom: '1px solid #ccc', zIndex: 10,
};
const btnVolver: React.CSSProperties = {
  padding: '6px 14px', background: '#0E6755', color: '#C39C59',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
};
const btnImprimir: React.CSSProperties = { ...btnVolver, background: '#C39C59', color: '#fff' };

const tarjeta: React.CSSProperties = {
  background: '#fff',
  maxWidth: 1024,
  margin: '0 auto',
  padding: 18,
  border: '2px solid #333',
  borderRadius: 6,
  fontFamily: 'Arial, sans-serif',
  color: '#111',
};
const cabeza: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '1.5px solid #333', paddingBottom: 6, marginBottom: 10,
};
const logoIzq: React.CSSProperties = { height: 42, objectFit: 'contain' };
const logoDer: React.CSSProperties = { height: 42, objectFit: 'contain' };
const titulo: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: '#222', letterSpacing: 1 };

const filaNombre: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 };
const labelNombre: React.CSSProperties = { fontWeight: 800, fontSize: 16 };
const cajaNombre: React.CSSProperties = {
  flex: 1, border: '1.5px solid #333', borderRadius: 14,
  padding: '12px 16px', fontSize: 16, fontWeight: 600,
  minHeight: 42, display: 'flex', alignItems: 'center',
};

const filaFnac: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 8 };
const labelFnac: React.CSSProperties = { fontWeight: 800, fontSize: 16 };
const cajaFnac: React.CSSProperties = {
  display: 'flex', border: '1.5px solid #333', borderRadius: 14,
  padding: '6px 8px', minWidth: 280, fontSize: 14, fontWeight: 600,
};

const filaIngreso: React.CSSProperties = { fontSize: 13, marginBottom: 8 };
const subrayado: React.CSSProperties = {
  borderBottom: '1px solid #333', display: 'inline-block',
  minWidth: 80, padding: '0 4px', textAlign: 'center',
};
const subrayadoCorto: React.CSSProperties = {
  borderBottom: '1px solid #333', display: 'inline-block',
  minWidth: 40, padding: '0 4px', textAlign: 'center',
};

const filaDatos: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 10,
  fontSize: 13, alignItems: 'center',
};
const cajaSexo: React.CSSProperties = {
  display: 'inline-block', width: 28, height: 28, border: '1.5px solid #333',
  borderRadius: 4, textAlign: 'center', lineHeight: '26px', fontWeight: 700,
};

const filaAlergias: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4,
};
const filaAlergiasSegunda: React.CSSProperties = {
  display: 'flex', alignItems: 'center', marginBottom: 10,
};
const cajaNoSi: React.CSSProperties = {
  display: 'inline-block', padding: '4px 14px', border: '1.5px solid #333',
  borderRadius: 4, fontWeight: 700, fontSize: 13,
};
const lineaLarga: React.CSSProperties = {
  flex: 1, borderBottom: '1px solid #333', marginLeft: 8, marginRight: 4, minHeight: 14,
};

const subtitEvaluacion: React.CSSProperties = {
  background: '#E5E5E5', padding: '6px 10px', fontSize: 13,
  marginBottom: 12, borderRadius: 4,
};
const gridEscalas: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 18,
  alignItems: 'flex-start',
};
const escalaCol: React.CSSProperties = { textAlign: 'center' };
const escalaTitulo: React.CSSProperties = { fontWeight: 700, fontSize: 13, marginBottom: 6 };
const escalaDolor: React.CSSProperties = {
  display: 'flex', gap: 2, marginTop: 8,
};
const escalaDolorEtiquetas: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#555',
  marginTop: 4, padding: '0 4px',
};
