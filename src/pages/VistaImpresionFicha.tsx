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
//   - Grupo sanguíneo y alergias desde pacientes
//   - Escala del dolor + fecha/hora evaluación desde formato_control_paciente
//
// Campos manuales (siguen en blanco si nadie los captura):
//   - Solo los datos del paciente capturados en VistaFormatoControl > sección
//     "Tarjeta de Identificación" se llenan automáticamente. Si esos campos están
//     vacíos en BD, se imprime con líneas en blanco listas para llenar a mano.

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { EncabezadoOficial } from './components/EncabezadoOficial';

interface FichaPaciente {
  id: string;
  nombre_paciente: string;
  edad: number | null;
  genero: string | null;
  nss_curp: string | null;
  expediente: string | null;
  fecha_nacimiento: string | null;
  diagnostico_ingreso: string | null;
  fecha_ingreso: string;
  hora_ingreso: string | null;
  grupo_sanguineo: string | null;
  alergias: string | null;
  numero_cama: string | null;
  riesgo_upp: string | null;
  riesgo_caidas: string | null;
  dolor_escala: number | null;
  dolor_evaluado_en: string | null;
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
          id, nombre_paciente, edad, genero, nss_curp, expediente, fecha_nacimiento, diagnostico_ingreso,
          fecha_ingreso, hora_ingreso, grupo_sanguineo, alergias,
          camas ( numero_cama ),
          formato_control_paciente ( riesgo_upp, riesgo_caidas, dolor_escala, dolor_evaluado_en )
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
      const cama = Array.isArray(data.camas) ? data.camas[0] : data.camas;
      setPaciente({
        id: data.id,
        nombre_paciente: data.nombre_paciente,
        edad: data.edad,
        genero: data.genero,
        nss_curp: data.nss_curp,
        expediente: data.expediente || null,
        fecha_nacimiento: data.fecha_nacimiento,
        diagnostico_ingreso: data.diagnostico_ingreso,
        fecha_ingreso: data.fecha_ingreso,
        hora_ingreso: data.hora_ingreso,
        grupo_sanguineo: data.grupo_sanguineo || null,
        alergias: data.alergias || null,
        numero_cama: cama?.numero_cama || null,
        riesgo_upp: fc?.riesgo_upp || null,
        riesgo_caidas: fc?.riesgo_caidas || null,
        dolor_escala: fc?.dolor_escala ?? null,
        dolor_evaluado_en: fc?.dolor_evaluado_en || null,
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

  // Fecha de nacimiento y expediente/CURP
  // - Fecha de nacimiento: columna real `fecha_nacimiento`. Si no está
  //   capturada pero el campo NSS/CURP contiene una CURP válida, la derivamos
  //   de la CURP (posiciones 5-10 = AAMMDD; el carácter 17 indica el siglo:
  //   dígito → 1900s, letra → 2000s).
  // - Expediente / CURP: el campo `nss_curp` guarda el identificador que
  //   capturó el gestor (NSS, CURP o número de expediente).
  const MESES_LARGOS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  let fnacDD = '____';
  let fnacMM = '__________';
  let fnacAAAA = '______';
  const aplicarFnac = (y: number, mo: number, d: number) => {
    if (d >= 1 && d <= 31) fnacDD = String(d).padStart(2, '0');
    if (mo >= 1 && mo <= 12) fnacMM = MESES_LARGOS[mo - 1];
    if (y > 0) fnacAAAA = String(y);
  };

  const idPaciente = (paciente.nss_curp || '').trim();
  const curp = idPaciente.toUpperCase();
  const esCurp = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(curp);

  if (paciente.fecha_nacimiento) {
    const [y, mo, d] = paciente.fecha_nacimiento.split('-').map((n) => parseInt(n, 10));
    aplicarFnac(y, mo, d);
  } else if (esCurp) {
    const siglo = /[A-Z]/.test(curp[16]) ? 2000 : 1900;
    aplicarFnac(
      siglo + parseInt(curp.substring(4, 6), 10),
      parseInt(curp.substring(6, 8), 10),
      parseInt(curp.substring(8, 10), 10),
    );
  }

  // Expediente: columna dedicada, INDEPENDIENTE de la CURP / fecha de nac.
  const expediente = (paciente.expediente || '').trim() || '______________';

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

  // Fecha y hora de evaluación del dolor: si está capturada, usamos esa;
  // si no, dejamos el día de hoy como guía (queda en blanco si tampoco
  // hay dolor_escala).
  const evalRef = paciente.dolor_evaluado_en ? new Date(paciente.dolor_evaluado_en) : new Date();
  const evalDD = String(evalRef.getDate()).padStart(2, '0');
  const evalMM = MESES_LARGOS[evalRef.getMonth()];
  const evalAAAA = evalRef.getFullYear();
  const evalHH = String(evalRef.getHours()).padStart(2, '0');
  const evalMin = String(evalRef.getMinutes()).padStart(2, '0');

  // Datos para imprimir
  const sexo = (paciente.genero || '').startsWith('F') ? 'F' : 'M';
  const grupoRh = paciente.grupo_sanguineo && paciente.grupo_sanguineo !== 'DESCONOCIDO'
    ? paciente.grupo_sanguineo
    : '';
  const tieneAlergias = !!(paciente.alergias && paciente.alergias.trim().length > 0);
  const textoAlergias = (paciente.alergias || '').trim();
  const dolorActual = paciente.dolor_escala;

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
      <div className="ficha-card" style={tarjeta}>
        {/* ENCABEZADO INSTITUCIONAL UNIFICADO */}
        <EncabezadoOficial formato="TARJETA DE IDENTIFICACIÓN" alturaLogos={44} margenInferior={14} />

        {/* Nombre + Cama */}
        <div style={filaNombre}>
          <span style={labelNombre}>NOMBRE:</span>
          <div style={cajaNombre}>{paciente.nombre_paciente}</div>
          {paciente.numero_cama && (
            <div style={camaBadge} title="Número de cama">
              <span style={camaBadgeLabel}>CAMA</span>
              <span style={camaBadgeNum}>{paciente.numero_cama}</span>
            </div>
          )}
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
            EXPEDIENTE: <span style={subrayado}>{expediente}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            GRUPO Y RH: <span style={subrayadoCorto}>{grupoRh || '_________'}</span>
          </div>
        </div>

        {/* CURP — solo si el identificador capturado es una CURP válida.
            Va en su propia línea, independiente del expediente. */}
        {esCurp && (
          <div style={{ ...filaDatos, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              CURP: <span style={subrayado}>{curp}</span>
            </div>
          </div>
        )}

        {/* Alergias */}
        <div style={filaAlergias}>
          <strong>ALERGIAS:</strong>
          <span style={{ ...cajaNoSi, background: !tieneAlergias ? '#FFF5C2' : 'transparent' }}>NO</span>
          <span style={{ ...cajaNoSi, background: tieneAlergias ? '#FFF5C2' : 'transparent' }}>SI</span>
          ¿CUÁLES?
          <span style={{ ...lineaLarga, fontWeight: 600 }}>{tieneAlergias ? textoAlergias : ' '}</span>
        </div>
        <div style={filaAlergiasSegunda}>
          <span style={lineaLarga}>{' '}</span>
        </div>

        {/* Subtítulo evaluación */}
        <div style={subtitEvaluacion}>
          <strong>EVALUACIÓN DEL PACIENTE</strong>{'    '}
          FECHA Y HORA:{' '}
          <span style={subrayado}>{paciente.dolor_evaluado_en ? evalDD : '__'}</span> / <span style={subrayado}>{paciente.dolor_evaluado_en ? evalMM : '________'}</span> / <span style={subrayado}>{paciente.dolor_evaluado_en ? evalAAAA : '____'}</span>
          {'     '}
          <span style={subrayadoCorto}>{paciente.dolor_evaluado_en ? evalHH : '__'}</span> : <span style={subrayadoCorto}>{paciente.dolor_evaluado_en ? evalMin : '__'}</span>
        </div>

        {/* Tres escalas visuales — SIN COLOR para ahorrar tóner.
            Sólo la opción capturada se ve "rellena" (fondo negro/borde grueso),
            el resto queda en blanco con contorno fino. */}
        <div style={gridEscalas}>
          {/* RIESGO DE CAÍDA */}
          <div style={escalaCol}>
            <div style={escalaTitulo}>RIESGO DE CAÍDA</div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
              <Circulo texto="ALTO" marcado={caidas === 'ALTO'} />
              <Circulo texto="MEDIANO" marcado={caidas === 'MEDIANO' || caidas === 'MEDIO'} />
              <Circulo texto="BAJO" marcado={caidas === 'BAJO'} />
            </div>
          </div>

          {/* RIESGO DE ÚLCERA POR PRESIÓN */}
          <div style={escalaCol}>
            <div style={escalaTitulo}>RIESGO DE ÚLCERA POR PRESIÓN</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, alignItems: 'center' }}>
              <BarraRiesgo texto="ALTO" marcado={upp === 'ALTO'} />
              <BarraRiesgo texto="MEDIANO" marcado={upp === 'MEDIANO' || upp === 'MEDIO'} />
              <BarraRiesgo texto="BAJO" marcado={upp === 'BAJO'} />
            </div>
          </div>

          {/* ESCALA DEL DOLOR */}
          <div style={escalaCol}>
            <div style={escalaTitulo}>
              ESCALA DEL DOLOR
              {dolorActual != null && (
                <span style={{ marginLeft: 6, fontSize: 11 }}>
                  · marcado: {dolorActual}
                </span>
              )}
            </div>
            <div style={escalaDolor}>
              {[0,1,2,3,4,5,6,7,8,9,10].map(n => {
                const seleccionado = dolorActual === n;
                return (
                  <div key={n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 9, fontWeight: 700 }}>{n}</div>
                    <div style={{
                      width: seleccionado ? 18 : 14,
                      height: seleccionado ? 18 : 14,
                      background: seleccionado ? '#000' : '#fff',
                      borderRadius: 2,
                      border: seleccionado ? '2px solid #000' : '1px solid #333',
                    }} />
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
        /* Carta horizontal con márgenes mínimos. La tarjeta ocupa toda la
           hoja (ancho y alto) para que nombre y fecha de nacimiento sean
           lo más grandes posibles sobre papel. */
        @page { size: letter landscape; margin: 6mm; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .ficha-page { padding: 0 !important; background: #fff !important; }
          /* En impresión, el tarjeta crece hasta llenar la carta horizontal */
          .ficha-card {
            max-width: none !important;
            width: 100% !important;
            min-height: calc(100vh - 12mm) !important;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
          }
        }
        @media screen {
          .ficha-page {
            background: #F5F1E8;
            min-height: 100vh;
            padding: 32px 16px;
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTES
// ============================================================
// Circulo B&W: contorno fino sin relleno por defecto; la opción marcada
// queda con borde grueso negro y un punto interno relleno para que se vea
// claramente sobre el papel sin gastar tóner.
function Circulo({ texto, marcado }: { texto: string; marcado: boolean }) {
  return (
    <div style={{
      width: 70, height: 70, borderRadius: '50%',
      background: '#fff', color: '#000', fontWeight: 800, fontSize: 11,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: marcado ? '3px solid #000' : '1px solid #333',
      position: 'relative',
    }}>
      {texto}
      {marcado && (
        <span style={{
          position: 'absolute', top: -6, right: -6,
          width: 18, height: 18, borderRadius: '50%',
          background: '#000', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, lineHeight: 1,
        }}>✓</span>
      )}
    </div>
  );
}

// BarraRiesgo B&W: cuadro de marcado + etiqueta en caja con borde. La
// opción capturada queda con cuadro relleno en negro y la caja en negrita.
function BarraRiesgo({ texto, marcado }: { texto: string; marcado: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        display: 'inline-block', width: 14, height: 14, border: '1.5px solid #333',
        background: marcado ? '#000' : '#fff',
      }} />
      <div style={{
        width: 140, padding: '4px 12px', background: '#fff', color: '#000',
        fontWeight: marcado ? 800 : 600, fontSize: 11, textAlign: 'center',
        border: marcado ? '2px solid #000' : '1px solid #333',
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

// Ocupa toda la hoja carta horizontal — usamos vw para que el card crezca
// hasta los márgenes del @page. Solo se aplica al imprimir; en pantalla
// queda en un contenedor de ancho fijo legible.
const tarjeta: React.CSSProperties = {
  background: '#fff',
  width: '100%',
  maxWidth: 1280,
  margin: '0 auto',
  padding: 14,
  border: '2.5px solid #333',
  borderRadius: 6,
  fontFamily: 'Arial, sans-serif',
  color: '#111',
};
const cabeza: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '2px solid #333', paddingBottom: 6, marginBottom: 14,
  gap: 12,
};
// Logo IMSS-Bienestar: más pequeño (32px vs 42px antes) — el usuario lo
// quiere "un poco más pequeño" sin alterar la imagen. Aspect ratio se
// mantiene con objectFit:contain.
const logoIzq: React.CSSProperties = { height: 32, objectFit: 'contain' };
const logoDer: React.CSSProperties = { height: 48, objectFit: 'contain' };
const titulo: React.CSSProperties = { fontSize: 28, fontWeight: 800, color: '#222', letterSpacing: 1.5 };

const filaNombre: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 };
const labelNombre: React.CSSProperties = { fontWeight: 800, fontSize: 22 };
const cajaNombre: React.CSSProperties = {
  flex: 1, border: '3px solid #333', borderRadius: 18,
  padding: '16px 22px', fontSize: 32, fontWeight: 900,
  letterSpacing: 0.7,
  minHeight: 62, display: 'flex', alignItems: 'center',
  textTransform: 'uppercase',
  background: '#fff',
};
// Badge de CAMA junto al nombre — número grande para identificar al instante.
const camaBadge: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  border: '3px solid #0E6755', borderRadius: 14,
  padding: '6px 18px', background: '#fff',
  minWidth: 90, minHeight: 62, justifyContent: 'center',
};
const camaBadgeLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#0E6755', letterSpacing: 1,
};
const camaBadgeNum: React.CSSProperties = {
  fontSize: 30, fontWeight: 900, color: '#0E6755', lineHeight: 1, marginTop: 2,
};

const filaFnac: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginBottom: 12 };
const labelFnac: React.CSSProperties = { fontWeight: 800, fontSize: 22 };
const cajaFnac: React.CSSProperties = {
  display: 'flex', border: '3px solid #333', borderRadius: 18,
  padding: '12px 18px', minWidth: 420, fontSize: 24, fontWeight: 900,
  letterSpacing: 0.5, alignItems: 'center', gap: 6,
};

const filaIngreso: React.CSSProperties = { fontSize: 15, marginBottom: 10, fontWeight: 600 };
const subrayado: React.CSSProperties = {
  borderBottom: '1.5px solid #333', display: 'inline-block',
  minWidth: 90, padding: '0 6px', textAlign: 'center', fontWeight: 700,
};
const subrayadoCorto: React.CSSProperties = {
  borderBottom: '1.5px solid #333', display: 'inline-block',
  minWidth: 50, padding: '0 6px', textAlign: 'center', fontWeight: 700,
};

const filaDatos: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 12,
  fontSize: 15, alignItems: 'center', fontWeight: 600,
};
const cajaSexo: React.CSSProperties = {
  display: 'inline-block', width: 32, height: 32, border: '2px solid #333',
  borderRadius: 4, textAlign: 'center', lineHeight: '28px', fontWeight: 800,
  fontSize: 16,
};

const filaAlergias: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, marginBottom: 4, fontWeight: 600,
};
const filaAlergiasSegunda: React.CSSProperties = {
  display: 'flex', alignItems: 'center', marginBottom: 12,
};
const cajaNoSi: React.CSSProperties = {
  display: 'inline-block', padding: '5px 18px', border: '2px solid #333',
  borderRadius: 4, fontWeight: 800, fontSize: 15,
};
const lineaLarga: React.CSSProperties = {
  flex: 1, borderBottom: '1.5px solid #333', marginLeft: 10, marginRight: 4, minHeight: 18,
};

const subtitEvaluacion: React.CSSProperties = {
  background: '#E5E5E5', padding: '8px 12px', fontSize: 15,
  marginBottom: 14, borderRadius: 4, fontWeight: 600,
};
// Las escalas crecen para llenar el resto de la hoja (la card es flex column,
// las escalas son el último elemento con flex:1).
const gridEscalas: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 22,
  alignItems: 'flex-start',
  flex: 1, marginTop: 4,
};
const escalaCol: React.CSSProperties = { textAlign: 'center' };
const escalaTitulo: React.CSSProperties = { fontWeight: 800, fontSize: 15, marginBottom: 10 };
const escalaDolor: React.CSSProperties = {
  display: 'flex', gap: 3, marginTop: 10,
};
const escalaDolorEtiquetas: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#333',
  marginTop: 6, padding: '0 4px', fontWeight: 600,
};
