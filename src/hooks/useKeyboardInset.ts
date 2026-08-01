import { useEffect, useState } from 'react'

/**
 * Cuánto del layout viewport queda tapado por el teclado en pantalla.
 *
 * En iOS, al abrir el teclado, el *visual viewport* se encoge pero el *layout
 * viewport* no: un elemento `position: fixed` anclado abajo (como un bottom
 * sheet) se queda con su base detrás del teclado. La diferencia entre los dos
 * es justo la altura tapada.
 *
 * Función pura para poder probarla: el teclado real no se reproduce en un
 * navegador de escritorio.
 */
export function keyboardInsetFrom(
  innerHeight: number,
  visualHeight: number,
  visualOffsetTop: number,
): number {
  return Math.max(0, Math.round(innerHeight - visualHeight - visualOffsetTop))
}

export interface ViewportState {
  /** Altura tapada por el teclado, en px (0 si está cerrado). */
  inset: number
  /** Alto del visual viewport, para acotar la hoja a lo que sí se ve. */
  height: number
}

/**
 * Sigue el teclado en vivo vía la VisualViewport API. El `Sheet` usa esto para
 * levantarse por encima del teclado en lugar de quedar tapado.
 */
export function useKeyboardInset(): ViewportState {
  const [state, setState] = useState<ViewportState>(() => ({
    inset: 0,
    height: window.visualViewport?.height ?? window.innerHeight,
  }))

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      setState({
        inset: keyboardInsetFrom(window.innerHeight, vv.height, vv.offsetTop),
        height: vv.height,
      })
    }
    update()

    // `resize` cubre abrir/cerrar el teclado; `scroll` cubre el reposiciona-
    // miento que hace iOS al enfocar un input cerca del borde inferior.
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return state
}
