export type ConfirmResult =
  | { kind: 'ok' }
  | { kind: 'fail'; message: string }
  /** Plantilla propia (requiere SMTP): hay que canjear el token con verifyOtp. */
  | { kind: 'verify'; tokenHash: string; type: string }
  | { kind: 'incomplete' }

const REUSED_OR_EXPIRED =
  'Ese enlace ya se usó o caducó. Si ya habías confirmado, solo entra con tu correo y contraseña.'
const GENERIC = 'No pudimos confirmar la cuenta con ese enlace.'

export const messages = { REUSED_OR_EXPIRED, GENERIC }

/**
 * Interpreta a dónde nos mandó Supabase tras confirmar el correo.
 *
 * Los formatos NO están inventados: se capturaron del stack local siguiendo un
 * correo real de confirmación. La plantilla por omisión enlaza a
 * `/auth/v1/verify`, que confirma del lado del servidor y responde 303 con el
 * resultado en el FRAGMENTO (no en la query), en flujo implícito.
 *
 * Es función pura para poder probarla sin provocar un correo cada vez.
 */
export function parseConfirmResult(search: string, hash: string): ConfirmResult {
  const query = new URLSearchParams(search.replace(/^\?/, ''))
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))

  if (fragment.has('error') || fragment.has('access_token')) {
    const error = fragment.get('error_code') ?? fragment.get('error')
    if (!error) return { kind: 'ok' }
    return {
      kind: 'fail',
      message:
        error === 'otp_expired' || error === 'access_denied' ? REUSED_OR_EXPIRED : GENERIC,
    }
  }

  const tokenHash = query.get('token_hash')
  if (tokenHash) {
    return { kind: 'verify', tokenHash, type: query.get('type') ?? 'signup' }
  }

  return { kind: 'incomplete' }
}
