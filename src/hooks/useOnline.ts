import { useEffect, useState } from 'react'

/**
 * `navigator.onLine` solo sabe si hay interfaz de red, no si hay internet de
 * verdad: dentro de un súper puedes tener wifi conectado y cero salida. Sirve
 * para el aviso de la barra, pero quien decide si un cambio subió o no es el
 * resultado real de la petición, nunca esto.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const arriba = () => setOnline(true)
    const abajo = () => setOnline(false)
    window.addEventListener('online', arriba)
    window.addEventListener('offline', abajo)
    return () => {
      window.removeEventListener('online', arriba)
      window.removeEventListener('offline', abajo)
    }
  }, [])

  return online
}
