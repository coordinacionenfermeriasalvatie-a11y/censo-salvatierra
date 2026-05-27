// src/pages/components/MenuPestanas.tsx
import React from 'react';

export type Pestana = 'censo' | 'dietas' | 'recetario' | 'control' | 'productividad' | 'erc' | 'instructivo_hdl' | 'bitacora_heridas';

interface Props {
  pestanaActiva: Pestana;
  onCambio: (p: Pestana) => void;
  servicioCodigo: string;
}

const pestanasBase: { id: Pestana; etiqueta: string; icono: string; disponible: boolean }[] = [
  { id: 'censo',         etiqueta: 'Censo',         icono: '🏥', disponible: true },
  { id: 'dietas',        etiqueta: 'Dietas',        icono: '🍽️', disponible: true },
  { id: 'recetario',     etiqueta: 'Recetario',     icono: '💊', disponible: true },
  { id: 'control',       etiqueta: 'Control',       icono: '📋', disponible: true },
  { id: 'productividad', etiqueta: 'Productividad', icono: '📊', disponible: true },
];

// Pestañas adicionales SOLO para HEMODIALISIS.
const pestanaERC = { id: 'erc' as Pestana, etiqueta: 'Censo ERC', icono: '🩺', disponible: true };
const pestanaInstructivoHDL = { id: 'instructivo_hdl' as Pestana, etiqueta: 'Instructivo HDL', icono: '📖', disponible: true };

// Pestaña adicional SOLO para CLÍNICA DE HERIDAS (CDH).
const pestanaBitacoraHeridas = { id: 'bitacora_heridas' as Pestana, etiqueta: 'Bitácora Heridas', icono: '🩹', disponible: true };

// Servicios ambulatorios: los pacientes no se hospitalizan ni reciben
// dietas hospitalarias ni medicación de recetario inter-hospitalario.
// Por eso se ocultan esas dos pestañas.
const SERVICIOS_AMBULATORIOS = new Set(['CDH', 'HDL', 'HDN']);

export const MenuPestanas: React.FC<Props> = ({ pestanaActiva, onCambio, servicioCodigo }) => {
  let pestanas = pestanasBase;

  // Filtrar Dietas y Recetario en servicios ambulatorios
  if (SERVICIOS_AMBULATORIOS.has(servicioCodigo)) {
    pestanas = pestanasBase.filter(p => p.id !== 'dietas' && p.id !== 'recetario');
  }

  if (servicioCodigo === 'HDL') {
    pestanas = [...pestanas, pestanaERC, pestanaInstructivoHDL];
  } else if (servicioCodigo === 'CDH') {
    pestanas = [...pestanas, pestanaBitacoraHeridas];
  }
  return (
    <div style={contenedor}>
      <div style={titulo}>
        SERVICIO: <strong style={{ color: '#0E6755' }}>{servicioCodigo}</strong>
      </div>
      <div style={tabsContainer}>
        {pestanas.map(p => {
          const activa = p.id === pestanaActiva;
          const deshabilitada = !p.disponible;
          return (
            <button
              key={p.id}
              onClick={() => p.disponible && onCambio(p.id)}
              disabled={deshabilitada}
              style={{
                ...tab,
                ...(activa ? tabActiva : {}),
                ...(deshabilitada ? tabDeshabilitada : {}),
              }}
              title={deshabilitada ? 'Próximamente' : p.etiqueta}
            >
              <span style={{ fontSize: 16 }}>{p.icono}</span>
              <span>{p.etiqueta}</span>
              {deshabilitada && <span style={badge}>pronto</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const contenedor: React.CSSProperties = { borderBottom: '2px solid #C39C59', marginBottom: 20, paddingBottom: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 };
const titulo: React.CSSProperties = { fontSize: 14, color: '#265C4E', marginBottom: 8 };
const tabsContainer: React.CSSProperties = { display: 'flex', gap: 4, flexWrap: 'wrap' };
const tab: React.CSSProperties = { padding: '10px 18px', border: '1px solid #C39C59', borderBottom: 'none', borderRadius: '8px 8px 0 0', background: '#F5F1E8', color: '#265C4E', cursor: 'pointer', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s', position: 'relative', bottom: -2 };
const tabActiva: React.CSSProperties = { background: '#0E6755', color: '#fff', borderColor: '#0E6755', fontWeight: 700, boxShadow: '0 -2px 8px rgba(14, 103, 85, 0.3)' };
const tabDeshabilitada: React.CSSProperties = { opacity: 0.5, cursor: 'not-allowed', background: '#e9e3d3' };
const badge: React.CSSProperties = { fontSize: 9, background: '#A32D2D', color: '#fff', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' };
