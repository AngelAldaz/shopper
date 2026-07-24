import { describe, expect, it } from 'vitest'
import { messages, parseConfirmResult } from './confirmResult'

/**
 * Los dos fragmentos de abajo son REALES: se capturaron siguiendo un correo de
 * confirmación contra el Supabase local, no se escribieron de memoria. Ese fue
 * justo el punto: el portal ya no deja editar plantillas sin SMTP propio, así
 * que había que averiguar qué manda de verdad la plantilla por omisión.
 */
const EXITO =
  '#access_token=eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.firma&expires_at=1784912371' +
  '&expires_in=3600&refresh_token=agupn2gykjjd&sb=&token_type=bearer&type=signup'

const YA_USADO =
  '#error=access_denied&error_code=otp_expired' +
  '&error_description=Email+link+is+invalid+or+has+expired&sb='

describe('parseConfirmResult', () => {
  it('reconoce la confirmación correcta de la plantilla por omisión', () => {
    expect(parseConfirmResult('', EXITO)).toEqual({ kind: 'ok' })
  })

  it('explica en claro un enlace ya usado o caducado', () => {
    const r = parseConfirmResult('', YA_USADO)
    expect(r.kind).toBe('fail')
    // Volver a tocar el enlace desde el correo es lo más común del mundo; el
    // mensaje tiene que decir qué hacer, no solo que algo falló.
    expect(r).toMatchObject({ message: messages.REUSED_OR_EXPIRED })
  })

  it('cae al mensaje genérico ante un error que no conocemos', () => {
    const r = parseConfirmResult('', '#error=server_error&error_code=boom')
    expect(r).toMatchObject({ kind: 'fail', message: messages.GENERIC })
  })

  it('acepta token_hash en la query, para cuando haya plantilla propia', () => {
    expect(parseConfirmResult('?token_hash=abc123&type=signup', '')).toEqual({
      kind: 'verify',
      tokenHash: 'abc123',
      type: 'signup',
    })
  })

  it('asume signup si la plantilla propia no manda el tipo', () => {
    expect(parseConfirmResult('?token_hash=abc123', '')).toMatchObject({ type: 'signup' })
  })

  it('detecta un enlace incompleto en vez de quedarse cargando', () => {
    expect(parseConfirmResult('', '')).toEqual({ kind: 'incomplete' })
  })

  it('el fragmento manda sobre la query si llegaran los dos', () => {
    // El endpoint /auth/v1/verify conserva la query original al redirigir, así
    // que puede llegar un token_hash ya consumido junto al resultado real.
    expect(parseConfirmResult('?token_hash=viejo', EXITO)).toEqual({ kind: 'ok' })
  })
})
