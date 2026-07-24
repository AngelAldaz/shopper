import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CircleCheck, CircleX, Loader } from 'lucide-react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { Card } from '@/components/ui/Card'
import { supabase } from '@/lib/supabase'

type Status = 'working' | 'ok' | 'fail'

/**
 * Aterrizaje del correo de confirmación.
 *
 * Esta pantalla casi siempre se abre en **Safari, no en el PWA instalado**: en
 * iOS son dos almacenamientos distintos. Por eso se canjea un `token_hash` con
 * verifyOtp en lugar de usar el flujo con `code`, que necesita un verifier
 * guardado en el navegador donde empezó el registro y aquí no existiría.
 *
 * Después de confirmar, la persona vuelve al icono de la app e inicia sesión
 * con su correo y contraseña. La sesión que queda aquí, en Safari, da igual.
 */
export function ConfirmEmailPage() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState<Status>('working')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const tokenHash = params.get('token_hash')
    const type = (params.get('type') ?? 'signup') as EmailOtpType

    if (!tokenHash) {
      setStatus('fail')
      setMessage('El enlace está incompleto. Ábrelo directamente desde el correo.')
      return
    }

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type })
      .then(({ error }) => {
        if (error) {
          setStatus('fail')
          setMessage(
            error.message.toLowerCase().includes('expired')
              ? 'Ese enlace ya caducó. Vuelve a la app e intenta registrarte de nuevo.'
              : 'No pudimos confirmar la cuenta con ese enlace.',
          )
        } else {
          setStatus('ok')
        }
      })
  }, [params])

  return (
    <div className="safe-x flex min-h-dvh items-center justify-center bg-bg px-5">
      <Card className="flex max-w-sm flex-col items-center gap-3 p-8 text-center">
        {status === 'working' && (
          <>
            <Loader size={44} className="animate-spin text-primary" />
            <h1 className="text-xl font-semibold">Confirmando…</h1>
          </>
        )}

        {status === 'ok' && (
          <>
            <CircleCheck size={52} className="text-success" />
            <h1 className="text-2xl font-semibold">¡Cuenta confirmada!</h1>
            <p className="text-balance text-muted">
              Ya puedes volver a <strong className="text-text">Shopper</strong> desde el icono de
              tu pantalla de inicio e iniciar sesión.
            </p>
            <p className="text-sm text-muted">No te vamos a pedir el correo otra vez.</p>
          </>
        )}

        {status === 'fail' && (
          <>
            <CircleX size={52} className="text-danger" />
            <h1 className="text-2xl font-semibold">No se pudo confirmar</h1>
            <p className="text-balance text-muted">{message}</p>
          </>
        )}
      </Card>
    </div>
  )
}
