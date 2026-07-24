import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/features/auth/SessionProvider'

export interface Household {
  id: string
  name: string
  invite_code: string
}

export interface Member {
  user_id: string
  role: 'owner' | 'member'
  display_name: string
  joined_at: string
}

interface HouseholdState {
  household: Household | null
  members: Member[]
  /** Rol de la persona con sesión dentro de este hogar. */
  myRole: 'owner' | 'member' | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const Ctx = createContext<HouseholdState>({
  household: null,
  members: [],
  myRole: null,
  loading: true,
  error: null,
  refresh: async () => {},
})

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const userId = session?.user.id ?? null

  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) {
      setHousehold(null)
      setMembers([])
      setLoading(false)
      return
    }
    setError(null)
    try {
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('active_household_id')
        .eq('id', userId)
        .single()
      if (pErr) throw pErr

      const activeId = profile?.active_household_id as string | null
      if (!activeId) {
        setHousehold(null)
        setMembers([])
        return
      }

      // Dos consultas en paralelo: el hogar y quiénes lo componen. RLS ya
      // garantiza que solo devuelvan algo si perteneces.
      const [{ data: h, error: hErr }, { data: ms, error: mErr }] = await Promise.all([
        supabase.from('households').select('id, name, invite_code').eq('id', activeId).single(),
        supabase
          .from('household_members')
          .select('user_id, role, joined_at, profiles(display_name)')
          .eq('household_id', activeId)
          .order('joined_at'),
      ])
      if (hErr) throw hErr
      if (mErr) throw mErr

      setHousehold(h as Household)
      setMembers(
        (ms ?? []).map((m) => {
          const p = m.profiles as { display_name?: string } | null
          return {
            user_id: m.user_id as string,
            role: m.role as 'owner' | 'member',
            joined_at: m.joined_at as string,
            display_name: p?.display_name || 'Sin nombre',
          }
        }),
      )
    } catch (e) {
      // Sin conexión no es un error que haya que gritar: la Fase 4 servirá esto
      // desde el espejo local. Por ahora se informa y la app sigue en pie.
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const myRole = members.find((m) => m.user_id === userId)?.role ?? null

  return (
    <Ctx value={{ household, members, myRole, loading, error, refresh: load }}>{children}</Ctx>
  )
}

export function useHousehold(): HouseholdState {
  return use(Ctx)
}
