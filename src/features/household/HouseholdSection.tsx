import { useEffect, useState } from 'react'
import { Check, Copy, Crown, LogOut, RefreshCw, UserMinus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Sheet } from '@/components/ui/Sheet'
import { shareText } from '@/lib/share'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/features/auth/SessionProvider'
import { useHousehold } from './useHousehold'
import { LeaveHouseholdSheet } from './LeaveHouseholdSheet'

export function HouseholdSection() {
  const { session } = useSession()
  const { household, members, myRole, refresh } = useHousehold()
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [transferring, setTransferring] = useState(false)

  // El aviso se borra solo: es confirmación de un gesto, no información que
  // haya que conservar en pantalla.
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(t)
  }, [flash])

  if (!household) return null
  const soyOwner = myRole === 'owner'

  async function shareCode() {
    if (!household) return
    const r = await shareText(
      `Únete a mi hogar en Shopper con el código ${household.invite_code}\n\nhttps://angelaldaz.github.io/shopper/`,
      'Shopper',
    )
    if (r.kind === 'copied') setFlash('Código copiado')
    else if (r.kind === 'failed') setFlash('No se pudo compartir')
  }

  async function regenerate() {
    if (!household) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('regenerate_invite_code', {
        p_household_id: household.id,
      })
      if (error) throw error
      await refresh()
      setFlash('Código nuevo generado')
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'No se pudo cambiar el código')
    } finally {
      setBusy(false)
    }
  }

  async function transfer(userId: string) {
    if (!household) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('transfer_ownership', {
        p_household_id: household.id,
        p_user_id: userId,
      })
      if (error) throw error
      await refresh()
      setTransferring(false)
      setFlash('Mando transferido')
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'No se pudo transferir')
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(userId: string, nombre: string) {
    if (!household) return
    if (!confirm(`¿Sacar a ${nombre} del hogar? Perderá el acceso a todo.`)) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('remove_member', {
        p_household_id: household.id,
        p_user_id: userId,
      })
      if (error) throw error
      await refresh()
      setFlash(`${nombre} salió del hogar`)
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'No se pudo sacar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card className="p-4">
        <h2 className="text-lg font-semibold">{household.name}</h2>
        <p className="mb-4 text-sm text-muted">
          {members.length === 1 ? 'Solo tú' : `${members.length} personas`}
        </p>

        <p className="mb-1.5 px-1 text-sm font-semibold text-muted">Código de invitación</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={shareCode}
            className="flex-1 rounded-soft bg-primary-soft py-3 text-center text-2xl font-semibold tracking-[0.25em] text-primary-ink active:brightness-95"
          >
            {household.invite_code}
          </button>
          <Button variant="soft" icon={<Copy size={18} />} onClick={shareCode} aria-label="Compartir código">
            <span className="sr-only">Compartir</span>
          </Button>
        </div>
        <p className="mt-2 px-1 text-sm text-muted">
          Compártelo con quien quieras que vea y edite tus listas. No caduca.
        </p>
        {soyOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            icon={<RefreshCw size={15} />}
            onClick={regenerate}
            disabled={busy}
          >
            Generar uno nuevo
          </Button>
        )}

        <ul className="mt-5 flex flex-col gap-1">
          {members.map((m) => {
            const soyYo = m.user_id === session?.user.id
            return (
              <li key={m.user_id} className="flex min-h-12 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-primary-ink">
                  {m.display_name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {m.display_name}
                  {soyYo && <span className="text-muted"> (tú)</span>}
                </span>
                {m.role === 'owner' && (
                  <Crown size={17} className="shrink-0 text-warning" aria-label="Manda en el hogar" />
                )}
                {soyOwner && !soyYo && (
                  <button
                    type="button"
                    onClick={() => removeMember(m.user_id, m.display_name)}
                    disabled={busy}
                    aria-label={`Sacar a ${m.display_name}`}
                    className="grid size-11 shrink-0 place-items-center rounded-full text-muted active:bg-danger-soft active:text-danger"
                  >
                    <UserMinus size={18} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        {flash && (
          <p className="mt-3 flex items-center gap-1.5 rounded-soft bg-success-soft px-3 py-2 text-sm text-success">
            <Check size={16} /> {flash}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          {soyOwner && members.length > 1 && (
            <Button variant="outline" block icon={<Crown size={17} />} onClick={() => setTransferring(true)}>
              Pasar el mando
            </Button>
          )}
          <Button variant="ghost" block icon={<LogOut size={17} />} onClick={() => setLeaving(true)}>
            Salir del hogar
          </Button>
        </div>
      </Card>

      <Sheet
        open={transferring}
        onClose={() => setTransferring(false)}
        title="¿Quién queda a cargo?"
      >
        <p className="mb-3 text-muted">
          Esa persona podrá cambiar el código de invitación y sacar a otros. Tú pasas a ser un
          miembro más.
        </p>
        <ul className="flex flex-col gap-1 pb-2">
          {members
            .filter((m) => m.user_id !== session?.user.id)
            .map((m) => (
              <li key={m.user_id}>
                <button
                  type="button"
                  onClick={() => transfer(m.user_id)}
                  disabled={busy}
                  className="flex min-h-14 w-full items-center gap-3 rounded-soft px-3 text-left active:bg-primary-soft"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-primary-ink">
                    {m.display_name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate font-semibold">{m.display_name}</span>
                </button>
              </li>
            ))}
        </ul>
      </Sheet>

      <LeaveHouseholdSheet
        open={leaving}
        onClose={() => setLeaving(false)}
        onLeft={async () => {
          setLeaving(false)
          // TODO(Fase 4): aquí hay que borrar además el espejo local de Dexie y
          // el caché de fotos del service worker. Mientras no exista el espejo,
          // refrescar basta: RLS ya cortó el acceso en el servidor.
          await refresh()
        }}
      />
    </>
  )
}
