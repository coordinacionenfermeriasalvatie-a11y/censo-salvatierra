// src/pages/components/ChatPanel.tsx
// Panel flotante de chat dentro de cada vista de servicio. Permite
// chatear con el equipo del propio servicio y con todos los servicios
// + jefatura (canal global).
//
// 2 canales:
//   - 'servicio:N' → solo personal del servicio + admins globales
//   - 'global'     → todos los autenticados (jefatura visible aquí)
//
// Realtime: usa supabase.channel() con postgres_changes para recibir
// mensajes nuevos sin polling.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface Mensaje {
  id: string;
  canal: string;
  remitente: string;
  contenido: string;
  creado_en: string;
  eliminado: boolean;
  remitente_nombre?: string;
  remitente_rol?: string;
}

interface Props {
  servicioId: number;
  servicioNombre: string;
}

type Tab = 'servicio' | 'global';

export const ChatPanel: React.FC<Props> = ({ servicioId, servicioNombre }) => {
  const { perfil } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [tab, setTab] = useState<Tab>('servicio');
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [perfiles, setPerfiles] = useState<Record<string, { nombre: string; rol: string }>>({});
  const [borrador, setBorrador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [unreadServicio, setUnreadServicio] = useState(0);
  const [unreadGlobal, setUnreadGlobal] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);

  const canalActivo = tab === 'servicio' ? `servicio:${servicioId}` : 'global';

  // Cargar mensajes del canal activo
  useEffect(() => {
    if (!abierto) return;
    (async () => {
      const { data, error } = await supabase
        .from('chat_mensajes')
        .select('id, canal, remitente, contenido, creado_en, eliminado')
        .eq('canal', canalActivo)
        .eq('eliminado', false)
        .order('creado_en', { ascending: true })
        .limit(200);
      if (!error && data) {
        setMensajes(data as Mensaje[]);
        await hidratarRemitentes(data as Mensaje[]);
        if (tab === 'servicio') setUnreadServicio(0); else setUnreadGlobal(0);
      }
    })();
  }, [abierto, canalActivo]);

  // Realtime: recibir mensajes nuevos. Solo nos suscribimos cuando el
  // perfil está listo. El nombre del canal incluye perfilId para evitar
  // que múltiples instancias compartan el mismo y stackeen listeners.
  useEffect(() => {
    if (!perfil) return;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`chat-mensajes-${perfil.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensajes' },
        async (payload) => {
          const m = payload.new as Mensaje;
          await hidratarRemitentes([m]);
          if (m.canal === canalActivo && abierto) {
            setMensajes(prev => prev.concat(m));
            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
              listaRef.current?.scrollTo({ top: 999999, behavior: 'smooth' });
            }, 50);
          } else if (m.remitente !== perfil.id) {
            if (m.canal === `servicio:${servicioId}`) setUnreadServicio(c => c + 1);
            else if (m.canal === 'global') setUnreadGlobal(c => c + 1);
          }
        }
      )
      .subscribe();
    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      supabase.removeChannel(ch);
    };
  }, [perfil, canalActivo, abierto, servicioId]);

  // Batch lookup de perfiles que aún no están en cache. SI el componente
  // hidrata 100 mensajes nuevos, hace UNA query con IN, no 100.
  const hidratarRemitentes = async (msgs: Mensaje[]) => {
    const faltantes = Array.from(new Set(msgs.map(m => m.remitente))).filter(id => !perfiles[id]);
    if (faltantes.length === 0) return;
    const { data } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, rol')
      .in('id', faltantes);
    if (data) {
      setPerfiles(prev => ({
        ...prev,
        ...Object.fromEntries(data.map((p: any) => [p.id, { nombre: p.nombre_completo, rol: p.rol }]))
      }));
    }
  };

  // Auto-scroll al abrir o cambiar de tab. Cleanup para evitar acceso
  // al ref después de desmontar.
  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(() => listaRef.current?.scrollTo({ top: 999999 }), 100);
    return () => clearTimeout(t);
  }, [abierto, tab]);

  const enviar = async () => {
    if (!perfil || !borrador.trim() || enviando) return;
    setEnviando(true);
    try {
      const { error } = await supabase
        .from('chat_mensajes')
        .insert({
          canal: canalActivo,
          remitente: perfil.id,
          contenido: borrador.trim(),
        });
      if (error) throw error;
      setBorrador('');
    } catch (e: any) {
      alert('No se pudo enviar el mensaje: ' + (e.message || 'error desconocido'));
    } finally {
      setEnviando(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  const unreadTotal = unreadServicio + unreadGlobal;

  const formatHora = (iso: string) => {
    const d = new Date(iso);
    const hoy = new Date();
    const esHoy = d.toDateString() === hoy.toDateString();
    const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    return esHoy ? hora : `${d.getDate()}/${d.getMonth()+1} ${hora}`;
  };

  const colorRol = (rol?: string): string => {
    switch (rol) {
      case 'jefe': return '#A32D2D';
      case 'subjefe':
      case 'supervisor': return '#7d5b2f';
      case 'gestor': return '#0E6755';
      default: return '#888';
    }
  };

  const etiquetaRol = (rol?: string): string => {
    switch (rol) {
      case 'jefe': return 'JEFE';
      case 'subjefe': return 'SUBJEFE';
      case 'supervisor': return 'SUPERV.';
      case 'gestor': return 'GESTOR';
      case 'enfermera': return 'ENF.';
      default: return '';
    }
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(o => !o)}
        style={botonFlotante}
        title="Chat de servicios"
      >
        💬
        {unreadTotal > 0 && !abierto && (
          <span style={badge}>{unreadTotal > 99 ? '99+' : unreadTotal}</span>
        )}
      </button>

      {/* Panel */}
      {abierto && (
        <div style={panel}>
          <div style={panelHeader}>
            <div style={panelTitulo}>💬 Chat</div>
            <button onClick={() => setAbierto(false)} style={botonCerrar} aria-label="Cerrar">✕</button>
          </div>

          <div style={tabs}>
            <button
              onClick={() => setTab('servicio')}
              style={tab === 'servicio' ? tabActivo : tabInactivo}
            >
              🏥 {servicioNombre}
              {unreadServicio > 0 && tab !== 'servicio' && <span style={tabBadge}>{unreadServicio}</span>}
            </button>
            <button
              onClick={() => setTab('global')}
              style={tab === 'global' ? tabActivo : tabInactivo}
            >
              🌐 Global / Jefatura
              {unreadGlobal > 0 && tab !== 'global' && <span style={tabBadge}>{unreadGlobal}</span>}
            </button>
          </div>

          <div ref={listaRef} style={lista}>
            {mensajes.length === 0 ? (
              <div style={vacio}>
                No hay mensajes todavía.<br />
                {tab === 'servicio'
                  ? 'Escribe el primero para tu equipo de servicio.'
                  : 'Escribe el primero para todo el hospital y la jefatura.'}
              </div>
            ) : (
              mensajes.map(m => {
                const p = perfiles[m.remitente];
                const yo = m.remitente === perfil?.id;
                return (
                  <div key={m.id} style={{ ...msgWrap, justifyContent: yo ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      ...burbuja,
                      background: yo ? '#0E6755' : '#fff',
                      color: yo ? '#fff' : '#265C4E',
                      borderColor: yo ? '#0E6755' : '#C39C59',
                    }}>
                      {!yo && (
                        <div style={remitenteInfo}>
                          <span style={remitenteNombre}>{p?.nombre || 'Cargando...'}</span>
                          {p?.rol && (
                            <span style={{ ...remitenteRol, background: colorRol(p?.rol) }}>
                              {etiquetaRol(p?.rol)}
                            </span>
                          )}
                        </div>
                      )}
                      <div style={msgTexto}>{m.contenido}</div>
                      <div style={{ ...msgHora, color: yo ? 'rgba(255,255,255,0.7)' : '#888' }}>
                        {formatHora(m.creado_en)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={inputArea}>
            <textarea
              value={borrador}
              onChange={e => setBorrador(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={tab === 'servicio'
                ? `Escribe a tu equipo de ${servicioNombre}...`
                : 'Escribe al hospital y la jefatura...'}
              style={textarea}
              rows={2}
              disabled={enviando}
            />
            <button
              onClick={enviar}
              disabled={!borrador.trim() || enviando}
              style={botonEnviar}
            >
              {enviando ? '...' : '➤'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ---- estilos ----
const botonFlotante: React.CSSProperties = {
  position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%',
  background: '#0E6755', color: '#fff', border: 'none', fontSize: 24, cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(0,0,0,0.3)', zIndex: 950,
};
const badge: React.CSSProperties = {
  position: 'absolute', top: -4, right: -4, background: '#A32D2D', color: '#fff',
  borderRadius: 10, padding: '2px 6px', fontSize: 11, fontWeight: 700,
  border: '2px solid #fff', minWidth: 20, textAlign: 'center',
};
const panel: React.CSSProperties = {
  position: 'fixed', bottom: 90, right: 24, width: 380, maxWidth: 'calc(100vw - 32px)',
  height: 560, maxHeight: 'calc(100vh - 120px)',
  background: '#fdfaf2', border: '2px solid #C39C59', borderRadius: 10,
  boxShadow: '0 10px 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column',
  zIndex: 951,
};
const panelHeader: React.CSSProperties = {
  background: '#0E6755', color: '#fff', padding: '10px 14px',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  borderRadius: '8px 8px 0 0',
};
const panelTitulo: React.CSSProperties = { fontWeight: 700, fontSize: 15 };
const botonCerrar: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18,
};
const tabs: React.CSSProperties = { display: 'flex', borderBottom: '1px solid #C39C59' };
const tabInactivo: React.CSSProperties = {
  flex: 1, padding: '8px 4px', border: 'none', background: '#F5F1E8', color: '#265C4E',
  cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', position: 'relative',
};
const tabActivo: React.CSSProperties = {
  ...tabInactivo, background: '#fff', color: '#0E6755', borderBottom: '2px solid #0E6755',
};
const tabBadge: React.CSSProperties = {
  marginLeft: 6, background: '#A32D2D', color: '#fff', borderRadius: 10, padding: '1px 5px',
  fontSize: 10, fontWeight: 700,
};
const lista: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: 10, background: '#fdfaf2' };
const vacio: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#888', fontSize: 13, lineHeight: 1.6 };
const msgWrap: React.CSSProperties = { display: 'flex', marginBottom: 8 };
const burbuja: React.CSSProperties = {
  maxWidth: '78%', padding: '6px 10px', borderRadius: 12, border: '1px solid',
  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
};
const remitenteInfo: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 };
const remitenteNombre: React.CSSProperties = { fontSize: 11, fontWeight: 700 };
const remitenteRol: React.CSSProperties = {
  fontSize: 9, color: '#fff', padding: '1px 5px', borderRadius: 8, fontWeight: 700, letterSpacing: 0.3,
};
const msgTexto: React.CSSProperties = { fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
const msgHora: React.CSSProperties = { fontSize: 9, textAlign: 'right', marginTop: 2 };
const inputArea: React.CSSProperties = {
  display: 'flex', gap: 6, padding: 8, borderTop: '1px solid #C39C59', background: '#F5F1E8',
};
const textarea: React.CSSProperties = {
  flex: 1, border: '1px solid #C39C59', borderRadius: 6, padding: '6px 8px',
  fontSize: 13, resize: 'none', fontFamily: 'inherit', background: '#fff', color: '#265C4E',
};
const botonEnviar: React.CSSProperties = {
  background: '#0E6755', color: '#fff', border: 'none', borderRadius: 6, padding: '0 16px',
  fontSize: 16, cursor: 'pointer', fontWeight: 700,
};
