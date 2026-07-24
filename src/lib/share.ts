/**
 * Copia texto al portapapeles.
 *
 * `navigator.clipboard` solo existe en contextos seguros, y en iOS falla si no
 * se llama desde un gesto del usuario. El respaldo con textarea + execCommand
 * es feo pero es el que funciona en esos casos, y aquí importa: el código de
 * invitación se comparte con el pulgar, no copiándolo a mano.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* cae al respaldo */
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export interface ShareResult {
  /** 'shared' abrió la hoja del sistema; 'copied' cayó al portapapeles. */
  kind: 'shared' | 'copied' | 'failed'
}

/**
 * Abre la hoja de compartir de iOS, o copia al portapapeles si no está.
 *
 * Cancelar la hoja lanza AbortError: eso NO es un fallo, así que no se debe
 * mostrar un error ni caer al portapapeles a espaldas de quien decidió no
 * compartir.
 */
export async function shareText(text: string, title?: string): Promise<ShareResult> {
  if (navigator.share) {
    try {
      await navigator.share(title ? { title, text } : { text })
      return { kind: 'shared' }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return { kind: 'shared' }
      // Cualquier otro fallo sí merece el respaldo.
    }
  }
  return { kind: (await copyText(text)) ? 'copied' : 'failed' }
}
