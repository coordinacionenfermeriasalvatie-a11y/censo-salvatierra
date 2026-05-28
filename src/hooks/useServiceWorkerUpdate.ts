// useServiceWorkerUpdate — detecta cuando hay una nueva versión del
// Service Worker disponible (esperando en estado 'waiting') y devuelve
// una función para activarla.
//
// Estrategia:
//   1. Al montar, obtener el registro actual del SW.
//   2. Hacer un update() para detectar si hay versión nueva.
//   3. Polling cada 60s para revisar si quedó una versión 'waiting'.
//   4. Escuchar el evento 'controllerchange' para hacer reload cuando
//      la nueva versión tome control.
//
// Uso:
//   const { hayActualizacion, actualizar } = useServiceWorkerUpdate();
//   if (hayActualizacion) <Banner onClick={actualizar} />

import { useCallback, useEffect, useState } from 'react';

export function useServiceWorkerUpdate() {
  const [hayActualizacion, setHayActualizacion] = useState(false);
  const [registro, setRegistro] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let timer: number | undefined;
    let cancelado = false;

    const revisar = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg || cancelado) return;
        setRegistro(reg);

        // Pedir al SW que verifique si hay versión nueva en el servidor
        await reg.update().catch(() => {});

        if (reg.waiting) {
          setHayActualizacion(true);
        }

        // Escuchar futuras instalaciones
        reg.addEventListener('updatefound', () => {
          const nuevo = reg.installing;
          if (!nuevo) return;
          nuevo.addEventListener('statechange', () => {
            if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
              setHayActualizacion(true);
            }
          });
        });
      } catch {
        /* silencioso */
      }
    };

    revisar();
    // Polling cada 60 segundos
    timer = window.setInterval(revisar, 60_000);

    // Cuando el nuevo SW tome control, hacer reload del cliente
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      cancelado = true;
      if (timer) window.clearInterval(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const actualizar = useCallback(() => {
    if (registro?.waiting) {
      registro.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // Fallback: ir a /reset.html que limpia todo
      window.location.href = '/reset.html';
    }
  }, [registro]);

  return { hayActualizacion, actualizar };
}
