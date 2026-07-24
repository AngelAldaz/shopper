import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface SessionState {
  session: Session | null
  /** true mientras se recupera la sesión guardada, para no parpadear al login. */
  loading: boolean
}

const SessionContext = createContext<SessionState>({ session: null, loading: true })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true })

  useEffect(() => {
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (alive) setState({ session: data.session, loading: false })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false })
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return <SessionContext value={state}>{children}</SessionContext>
}

export function useSession(): SessionState {
  return use(SessionContext)
}
