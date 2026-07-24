import { useState, type FormEvent } from 'react'
import { Home, Store as StoreIcon, UserPlus } from 'lucide-react'
import { Bow } from '@/components/ui/Bow'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Field } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/features/auth/SessionProvider'
import { useHousehold } from './useHousehold'
import { PRESET_STORES } from './stores-preset'

type Step = 'choose' | 'create' | 'join' | 'stores'

export function OnboardingPage() {
  const { session } = useSession()
  const { refresh } = useHousehold()
  const [step, setStep] = useState<Step>('choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])

  const firstName = (session?.user.user_metadata?.['display_name'] as string | undefined)
    ?.split(' ')[0]

  async function createHousehold(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('create_household', { p_name: name.trim() })
      if (error) throw error
      setHouseholdId(data as string)
      setStep('stores')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function joinHousehold(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.rpc('join_household', { p_code: code.trim() })
      if (error) throw error
      // Quien se une llega a un hogar que ya tiene supers y catálogo: no hay
      // nada que configurar, entra directo.
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveStores() {
    if (!householdId) return
    setBusy(true)
    setError(null)
    try {
      if (picked.length > 0) {
        const rows = PRESET_STORES.filter((s) => picked.includes(s.name)).map((s) => ({
          // El id lo genera el cliente desde ya: es la misma regla que usará
          // todo el motor local-first de la Fase 4.
          id: crypto.randomUUID(),
          household_id: householdId,
          name: s.name,
          color: s.color,
        }))
        const { error } = await supabase.from('stores').insert(rows)
        if (error) throw error
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      {step === 'choose' && (
        <>
          <Header
            title={firstName ? `¡Hola, ${firstName}!` : '¡Hola!'}
            subtitle="Para empezar, arma tu hogar o únete a uno que ya exista."
          />
          <div className="flex flex-col gap-3">
            <BigOption
              Icon={Home}
              title="Crear mi hogar"
              description="Empiezas de cero y luego puedes invitar a quien quieras."
              onClick={() => setStep('create')}
            />
            <BigOption
              Icon={UserPlus}
              title="Unirme a un hogar"
              description="Si alguien ya tiene uno, pídele su código de 6 letras."
              onClick={() => setStep('join')}
            />
          </div>
        </>
      )}

      {step === 'create' && (
        <>
          <Header title="¿Cómo se llama tu hogar?" subtitle="Puedes cambiarlo después." />
          <Card className="p-5">
            <form onSubmit={createHousehold} className="flex flex-col gap-4">
              <Field
                label="Nombre del hogar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Casa"
                maxLength={40}
                autoFocus
                required
              />
              <ErrorNote message={error} />
              <Button type="submit" size="lg" block disabled={busy || !name.trim()}>
                {busy ? 'Creando…' : 'Crear hogar'}
              </Button>
            </form>
          </Card>
          <BackLink onClick={() => { setStep('choose'); setError(null) }} />
        </>
      )}

      {step === 'join' && (
        <>
          <Header
            title="Escribe el código"
            subtitle="Son 6 letras y números que te comparte quien ya tiene el hogar."
          />
          <Card className="p-5">
            <form onSubmit={joinHousehold} className="flex flex-col gap-4">
              <Field
                label="Código de invitación"
                value={code}
                // Se normaliza al teclear: el código no lleva minúsculas ni
                // caracteres raros, y así no falla por un detalle de forma.
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="ABC123"
                maxLength={6}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="text-center text-2xl font-semibold tracking-[0.3em]"
                autoFocus
                required
              />
              <ErrorNote message={error} />
              <Button type="submit" size="lg" block disabled={busy || code.length !== 6}>
                {busy ? 'Entrando…' : 'Unirme'}
              </Button>
            </form>
          </Card>
          <BackLink onClick={() => { setStep('choose'); setError(null) }} />
        </>
      )}

      {step === 'stores' && (
        <>
          <Header
            title="¿Dónde haces el súper?"
            subtitle="Elige los que visitas. Puedes agregar más después."
          />
          <Card className="p-5">
            <div className="flex flex-wrap gap-2">
              {PRESET_STORES.map((s) => (
                <Chip
                  key={s.name}
                  tint={s.color}
                  selected={picked.includes(s.name)}
                  onClick={() =>
                    setPicked((p) =>
                      p.includes(s.name) ? p.filter((x) => x !== s.name) : [...p, s.name],
                    )
                  }
                >
                  <StoreIcon size={15} />
                  {s.name}
                </Chip>
              ))}
            </div>
          </Card>
          <ErrorNote message={error} />
          <Button size="lg" block className="mt-4" onClick={saveStores} disabled={busy}>
            {busy ? 'Guardando…' : picked.length > 0 ? `Listo (${picked.length})` : 'Saltar por ahora'}
          </Button>
        </>
      )}
    </Screen>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="safe-x flex min-h-dvh flex-col justify-center bg-bg px-5 py-[calc(env(safe-area-inset-top)+2rem)]">
      <div className="mx-auto w-full max-w-sm">{children}</div>
    </div>
  )
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex flex-col items-center gap-2 text-center">
      <Bow size={56} className="text-primary" />
      <h1 className="text-2xl font-semibold text-balance">{title}</h1>
      <p className="text-balance text-muted">{subtitle}</p>
    </div>
  )
}

function BigOption({
  Icon,
  title,
  description,
  onClick,
}: {
  Icon: typeof Home
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 rounded-card border border-border bg-surface p-5 text-left',
        'shadow-sweet transition-transform duration-150 active:scale-[0.98] active:bg-surface-2',
      )}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-ink">
        <Icon size={24} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{description}</span>
      </span>
    </button>
  )
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-soft bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <div className="mt-4 text-center">
      <Button variant="ghost" onClick={onClick}>
        Volver
      </Button>
    </div>
  )
}
