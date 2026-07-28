import { useEffect } from 'react'

/**
 * Mantiene la pantalla encendida mientras `active` sea true.
 *
 * Para el modo compra: recorres el súper con el teléfono en la mano y la
 * pantalla no debe apagarse cada 30 segundos entre producto y producto.
 *
 * La API (Screen Wake Lock) existe en Safari desde la 16.4 y se libera sola al
 * cambiar de pestaña; por eso se re-solicita al volver a ser visible.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        // Silencioso a propósito: negar el wake lock (batería baja, etc.) no es
        // un error que la persona deba ver. La lista sigue funcionando.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release()
    }
  }, [active])
}
