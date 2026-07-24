import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './dexie'
import { countFailed, countPending, retryFailed as retryFailedOps } from './outbox'
import { setMutationListener } from './mutate'
import { syncNow } from './sync'
import { supabase } from '@/lib/supabase'
import { useOnline } from '@/hooks/useOnline'
import { PUSH_ENTITIES } from './schema'

interface SyncState {
  online: boolean
  syncing: boolean
  pending: number
  failed: number
  lastSyncedAt: string | null
  error: string | null
  sync: () => void
  retryFailed: () => Promise<void>
}

const Ctx = createContext<SyncState>({
  online: true,
  syncing: false,
  pending: 0,
  failed: 0,
  lastSyncedAt: null,
  error: null,
  sync: () => {},
  retryFailed: async () => {},
})

/** Se agrupan los cambios seguidos: tachar cinco productos es UNA subida. */
const DEBOUNCE_MS = 800

export function SyncProvider({
  householdId,
  children,
}: {
  householdId: string
  children: ReactNode
}) {
  const online = useOnline()
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Los contadores salen del propio Dexie, así que la barra se actualiza sola
  // en cuanto se encola o se sube algo, sin avisos manuales.
  const pending = useLiveQuery(() => countPending(), [], 0)
  const failed = useLiveQuery(() => countFailed(), [], 0)

  const running = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback(async () => {
    // Una sola sincronización a la vez: dos a la vez podrían mandar la misma
    // operación dos veces y pelearse por la marca de tiempo.
    if (running.current) return
    running.current = true
    setSyncing(true)
    try {
      const { pull } = await syncNow()
      setError(pull.error)
      if (!pull.error) setLastSyncedAt(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      running.current = false
      setSyncing(false)
    }
  }, [])

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void run(), DEBOUNCE_MS)
  }, [run])

  // Cada escritura local pide sincronizar, sin esperar a un temporizador fijo.
  useEffect(() => {
    setMutationListener(schedule)
    return () => setMutationListener(null)
  }, [schedule])

  useEffect(() => {
    void run()
  }, [run, householdId])

  // iOS no tiene Background Sync, así que estos tres eventos son TODA la
  // oportunidad de subir lo pendiente. Cubren el caso real: sales del súper,
  // vuelve la señal, abres la app.
  useEffect(() => {
    const alVolver = () => void run()
    const alMostrar = () => {
      if (document.visibilityState === 'visible') void run()
    }
    window.addEventListener('online', alVolver)
    document.addEventListener('visibilitychange', alMostrar)
    return () => {
      window.removeEventListener('online', alVolver)
      document.removeEventListener('visibilitychange', alMostrar)
    }
  }, [run])

  // Realtime: si van dos personas al súper, cada una ve lo que la otra tacha.
  // No se aplica el contenido del evento, solo se dispara una bajada: aplicar
  // el payload directo competiría con lo que aún no ha subido de esta cola.
  useEffect(() => {
    const channel = supabase.channel(`hogar:${householdId}`)
    for (const table of PUSH_ENTITIES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
        schedule,
      )
    }
    channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [householdId, schedule])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const retryFailed = useCallback(async () => {
    await retryFailedOps()
    await run()
  }, [run])

  return (
    <Ctx
      value={{
        online,
        syncing,
        pending: pending ?? 0,
        failed: failed ?? 0,
        lastSyncedAt,
        error,
        sync: () => void run(),
        retryFailed,
      }}
    >
      {children}
    </Ctx>
  )
}

export function useSync(): SyncState {
  return use(Ctx)
}

/** Consulta reactiva contra el espejo local. Azúcar sobre useLiveQuery. */
export { useLiveQuery, db }
