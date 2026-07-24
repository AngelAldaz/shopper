import { useEffect, useState } from 'react'
import { CircleCheck, CircleX, Loader } from 'lucide-react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { Card } from '@/components/ui/Card'
import { supabase } from '@/lib/supabase'
import { messages, parseConfirmResult } from './confirmResult'

type Status = 'working' | 'ok' | 'fail'

/**
 * Aterrizaje del correo de confirmación.
 *
 * Se abre casi siempre en **Safari, no en el PWA instalado**: en iOS son dos
 * almacenamientos distintos. Funciona igual porque el flujo por omisión de
 * Supabase es implícito — la cuenta ya quedó confirmada en el servidor antes
 * de llegar aquí, así que no hace falta ningún dato guardado en este
 * navegador. La lógica de lectura vive en confirmResult.ts, con pruebas.
 */
export function ConfirmEmailPage() {
  const [status, setStatus] = useState<Status>('working')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const result = parseConfirmResult(window.location.search, window.location.hash)

    // Los tokens no deben quedarse en la barra de direcciones ni en el
    // historial de Safari.
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }

    if (result.kind === 'ok') {
      setStatus('ok')
      return
    }

    if (result.kind === 'fail') {
      setStatus('fail')
      setMessage(result.message)
      return
    }

    if (result.kind === 'incomplete') {
      setStatus('fail')
      setMessage('Este enlace está incompleto. Ábrelo tocándolo directamente desde el correo.')
      return
    }

    supabase.auth
      .verifyOtp({ token_hash: result.tokenHash, type: result.type as EmailOtpType })
      .then(({ error }) => {
        if (!error) {
          setStatus('ok')
          return
        }
        setStatus('fail')
        setMessage(
          error.message.toLowerCase().includes('expired')
            ? messages.REUSED_OR_EXPIRED
            : messages.GENERIC,
        )
      })
  }, [])

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
