import { useState, type FormEvent } from 'react'
import { MailCheck } from 'lucide-react'
import { Bow } from '@/components/ui/Bow'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

type Mode = 'signin' | 'signup'

/** Traduce los errores de Supabase, que llegan en inglés y muy técnicos. */
function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('email not confirmed')) return 'Falta confirmar tu correo. Revisa tu bandeja.'
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Ese correo ya tiene cuenta. Inicia sesión.'
  if (m.includes('password should be at least'))
    return 'La contraseña necesita al menos 8 caracteres.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Demasiados intentos seguidos. Espera un momento.'
  if (m.includes('failed to fetch')) return 'Sin conexión. Revisa tu internet.'
  return message
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: name.trim() },
            // El correo lleva un token_hash y aterriza aquí. verifyOtp funciona
            // en cualquier navegador, que es lo que hace falta porque el enlace
            // se abre en Safari y no en el PWA instalado.
            emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}auth/confirm`,
          },
        })
        if (error) throw error
        setSent(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        // No hay que navegar: SessionProvider detecta la sesión y el router
        // deja de mostrar esta pantalla.
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Screen>
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <MailCheck size={48} className="text-primary" />
          <h1 className="text-2xl font-semibold">Revisa tu correo</h1>
          <p className="text-balance text-muted">
            Le mandamos un enlace a <strong className="text-text">{email}</strong> para confirmar
            tu cuenta. Ábrelo y vuelve aquí para iniciar sesión.
          </p>
          <p className="text-sm text-muted">
            Es el único correo que te vamos a mandar.
          </p>
          <Button variant="ghost" onClick={() => { setSent(false); setMode('signin') }}>
            Ya lo confirmé
          </Button>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen>
      <div className="mb-7 flex flex-col items-center gap-2">
        <Bow size={72} className="text-primary" />
        <h1 className="text-3xl font-semibold">Shopper</h1>
        <p className="text-balance text-center text-muted">
          Tus listas del súper, siempre al mejor precio.
        </p>
      </div>

      {!isSupabaseConfigured && (
        <Card className="mb-4 border-warning bg-warning-soft p-4 text-sm">
          Faltan las llaves de Supabase. Copia <code>.env.example</code> a <code>.env</code> y
          pega la URL y la anon key del proyecto.
        </Card>
      )}

      <Card className="p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === 'signup' && (
            <Field
              label="¿Cómo te llamas?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Ana"
              required
            />
          )}

          <Field
            label="Correo"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="email"
            placeholder="tu@correo.com"
            required
          />

          <Field
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            // Le dice a iOS si guardar o proponer una contraseña del llavero.
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={8}
            hint={mode === 'signup' ? 'Mínimo 8 caracteres' : undefined}
            required
          />

          {error && (
            <p role="alert" className="rounded-soft bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" block disabled={busy || !isSupabaseConfigured}>
            {busy ? 'Un momento…' : mode === 'signup' ? 'Crear cuenta' : 'Entrar'}
          </Button>
        </form>
      </Card>

      <div className="mt-4 text-center">
        <Button
          variant="ghost"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
          }}
        >
          {mode === 'signin' ? '¿Primera vez? Crea tu cuenta' : 'Ya tengo cuenta'}
        </Button>
      </div>
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
