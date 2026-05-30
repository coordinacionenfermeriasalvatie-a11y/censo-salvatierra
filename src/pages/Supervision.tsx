// Carpeta de Supervisión — índice de herramientas exclusivas
// para subjefes y supervisores de enfermería.
//
// Agrupa todas las bitácoras y vistas administrativas en una sola
// página para que el Dashboard no se llene de botones. Diseñado para
// crecer: cada tarjeta es independiente, agregar más es trivial.
//
// Acceso: jefe, subjefe, supervisor (admin global). Gestores/enfermeras NO.

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROLES_ADMIN_GLOBAL, formatearTitulo, supervisionDeScope } from '../types';

const LS_CONSOLIDAR = 'censo:consolidarSup';

interface Herramienta {
  icono: string;
  titulo: string;
  descripcion: string;
  ruta: string;
  color: string;
  badge?: string;
  // Si true, la herramienta depende de la supervisión: se le agrega ?sup=N.
  // (Fondo fijo y vales cambian por supervisión; Tablero/Médicos son globales.)
  supParam?: boolean;
}

const HERRAMIENTAS: Herramienta[] = [
  {
    icono: '📋',
    titulo: 'Bitácora de Supervisión',
    descripcion: 'Concentrado diario de vales controlados por turno (M/V/N). Aprobar, rechazar y canjear vales generados por los gestores.',
    ruta: '/bitacora-supervision',
    color: '#0E6755',
    supParam: true,
  },
  {
    icono: '💊',
    titulo: 'Fondo Fijo de Psicotrópicos',
    descripcion: 'Inventario con fondo fijo institucional. Existencias actualizadas en tiempo real con cada vale canjeado. Bitácora diaria y semanal con archivo histórico.',
    ruta: '/bitacora-psicotropicos',
    color: '#A32D2D',
    supParam: true,
  },
  {
    icono: '📊',
    titulo: 'Tablero Maestro (solo día)',
    descripcion: 'KPIs ejecutivos, ocupación por servicio, hemodiálisis/diálisis y ERC del día. Adentro incluye acceso a Auditoría del día y turno en curso.',
    ruta: '/tablero?soloDia=1',
    color: '#2c5fa3',
  },
  {
    icono: '🩺',
    titulo: 'Médicos Adscritos',
    descripcion: 'Catálogo de médicos prescriptores. Alimenta el dropdown de médico en la receta de medicamento controlado (autocompleta cédula y especialidad).',
    ruta: '/medicos-adscritos',
    color: '#7d5b2f',
  },
];

export const Supervision: React.FC = () => {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const { sup } = useParams<{ sup?: string }>();

  // Supervisión pedida por la URL (1/2 válidos; cualquier otra cosa = ninguna)
  const supUrl: 1 | 2 | null = sup === '1' ? 1 : sup === '2' ? 2 : null;

  // Modo principal (suplencia): cuando falta el supervisor de un grupo, Sup 1
  // concentra todo. Manual y persistido por dispositivo (no toca la BD).
  const [consolidado, setConsolidado] = useState<boolean>(
    () => localStorage.getItem(LS_CONSOLIDAR) === '1'
  );
  const setModo = (v: boolean) => {
    setConsolidado(v);
    if (v) localStorage.setItem(LS_CONSOLIDAR, '1');
    else localStorage.removeItem(LS_CONSOLIDAR);
  };

  // Con modo principal activo, la carpeta de Supervisión 2 redirige a la 1.
  // Solo para admins globales sin grupo propio; un supervisor con grupo manda.
  useEffect(() => {
    if (!perfil) return;
    const g = supervisionDeScope(perfil);
    if (consolidado && supUrl === 2 && g == null) {
      navigate('/supervision/1', { replace: true });
    }
  }, [consolidado, supUrl, perfil, navigate]);

  if (!perfil) return <div style={cargando}>Verificando perfil...</div>;

  const grupoSup = supervisionDeScope(perfil);
  // Supervisión efectiva de esta carpeta:
  //  - supervisor con grupo: SIEMPRE su grupo (no puede abrir el de la otra)
  //  - jefe/subjefe/supervisor sin grupo: la de la URL, o 1 por defecto
  const supEfectiva: 1 | 2 = grupoSup ?? supUrl ?? 1;

  if (!ROLES_ADMIN_GLOBAL.includes(perfil.rol)) {
    return (
      <div style={bloqueado}>
        🚫 Esta carpeta es exclusiva para jefatura, subjefatura y supervisión de enfermería.
        <button onClick={() => navigate('/')} style={btnVolver}>← Volver al inicio</button>
      </div>
    );
  }

  return (
    <div style={pagina}>
      <div style={header}>
        <div>
          <h1 style={titulo}>
            🗂️ Carpeta de Supervisión {supEfectiva}
          </h1>
          <p style={subt}>
            Herramientas exclusivas para {formatearTitulo(perfil)}
            {grupoSup ? ` · Supervisión ${grupoSup} (sus servicios)` : ` · viendo Supervisión ${supEfectiva}`} · Hospital General Salvatierra
          </p>
        </div>
        <button onClick={() => navigate('/')} style={btnVolver}>← Dashboard</button>
      </div>

      {supEfectiva === 1 && grupoSup == null && (
        <div style={modoBox}>
          <label style={modoLabel}>
            <input
              type="checkbox"
              checked={consolidado}
              onChange={e => setModo(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
            />
            <span>
              <strong>Modo principal</strong> — concentra los vales de Supervisión 2 en Supervisión 1.
              Úsalo cuando falte el supervisor de Sup 2: la bitácora mostrará Sup 1 + 2 y la carpeta de
              Supervisión II redirigirá aquí. {consolidado ? '🟢 Activo' : '⚪ Inactivo'}
            </span>
          </label>
        </div>
      )}

      <div style={grid}>
        {HERRAMIENTAS.map(h => (
          <button
            key={h.ruta}
            onClick={() => {
              const extra = consolidado && supEfectiva === 1 ? '&consol=1' : '';
              navigate(h.supParam ? `${h.ruta}?sup=${supEfectiva}${extra}` : h.ruta);
            }}
            style={tarjeta(h.color)}
          >
            <div style={tarjetaHeader(h.color)}>
              <span style={icono}>{h.icono}</span>
              <span style={tarjetaTitulo}>{h.titulo}</span>
              {h.badge && <span style={badge}>{h.badge}</span>}
            </div>
            <div style={tarjetaDesc}>{h.descripcion}</div>
            <div style={tarjetaAbrir(h.color)}>Abrir →</div>
          </button>
        ))}

        {/* Placeholder para futuras bitácoras */}
        <div style={placeholder}>
          <div style={placeholderTxt}>
            ➕<br />
            <strong>Próximamente</strong>
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              Aquí se agregarán nuevas bitácoras y herramientas administrativas conforme se vayan necesitando.
            </div>
          </div>
        </div>
      </div>

      <div style={pie}>
        <strong>Nota:</strong> Esta carpeta crecerá con el tiempo. Pídeme nuevas bitácoras o accesos rápidos cuando los necesites — agregar uno toma minutos.
      </div>
    </div>
  );
};

// ============================================================
const pagina: React.CSSProperties = { padding: 24, background: '#F2EBE4', minHeight: '100vh' };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12 };
const titulo: React.CSSProperties = { color: '#0E6755', fontSize: 26, fontWeight: 700, margin: 0 };
const subt: React.CSSProperties = { color: '#7d5b2f', fontSize: 13, margin: '6px 0 0' };
const btnVolver: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', color: '#0E6755', padding: '10px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 };

const grid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 16, marginBottom: 24,
};

const tarjeta = (color: string): React.CSSProperties => ({
  background: '#fff',
  border: `1px solid ${color}33`,
  borderRadius: 8,
  padding: 0,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column' as const,
  textAlign: 'left' as const,
  fontFamily: 'inherit',
  overflow: 'hidden' as const,
  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
  transition: 'transform 0.15s, box-shadow 0.15s',
});

const tarjetaHeader = (color: string): React.CSSProperties => ({
  background: color,
  color: '#fff',
  padding: '14px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
});

const icono: React.CSSProperties = { fontSize: 26, lineHeight: 1 };
const tarjetaTitulo: React.CSSProperties = { fontWeight: 700, fontSize: 15, flex: 1 };
const badge: React.CSSProperties = { background: '#fff', color: '#000', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 };

const tarjetaDesc: React.CSSProperties = {
  padding: '14px 16px', fontSize: 13, color: '#555', lineHeight: 1.5, flex: 1,
};

const tarjetaAbrir = (color: string): React.CSSProperties => ({
  padding: '8px 16px',
  background: '#fafafa',
  borderTop: '1px solid #eee',
  color,
  fontWeight: 700,
  fontSize: 13,
  textAlign: 'right' as const,
});

const placeholder: React.CSSProperties = {
  background: 'transparent', border: '2px dashed #C39C59', borderRadius: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: 180, color: '#7d5b2f', textAlign: 'center' as const, padding: 20,
};
const placeholderTxt: React.CSSProperties = { fontSize: 18 };

const modoBox: React.CSSProperties = {
  background: '#fff7e0', border: '1px solid #C39C59', borderRadius: 6,
  padding: '10px 14px', marginBottom: 16,
};
const modoLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
  color: '#7d5b2f', lineHeight: 1.5, cursor: 'pointer',
};

const pie: React.CSSProperties = {
  padding: 12, background: '#fff7e0', border: '1px solid #C39C59', borderRadius: 6,
  fontSize: 12, color: '#7d5b2f', lineHeight: 1.6,
};

const cargando: React.CSSProperties = { padding: 40, textAlign: 'center' as const, color: '#888', fontStyle: 'italic' as const };
const bloqueado: React.CSSProperties = { padding: 40, textAlign: 'center' as const, color: '#A32D2D', fontSize: 16, display: 'flex', flexDirection: 'column' as const, gap: 16, alignItems: 'center' };
