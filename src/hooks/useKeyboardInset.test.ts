import { describe, expect, it } from 'vitest'
import { keyboardInsetFrom } from './useKeyboardInset'

describe('keyboardInsetFrom', () => {
  it('es 0 con el teclado cerrado (los dos viewports coinciden)', () => {
    expect(keyboardInsetFrom(844, 844, 0)).toBe(0)
  })

  it('mide la altura del teclado cuando el visual viewport se encoge', () => {
    // iPhone 13: layout 844, teclado ~336 → visual 508.
    expect(keyboardInsetFrom(844, 508, 0)).toBe(336)
  })

  it('cuenta el desplazamiento que hace iOS al enfocar cerca del borde', () => {
    // Mismo teclado, pero iOS subió el contenido 40px.
    expect(keyboardInsetFrom(844, 508, 40)).toBe(296)
  })

  it('nunca es negativo, aunque el visual viewport reporte de más', () => {
    expect(keyboardInsetFrom(844, 850, 0)).toBe(0)
  })

  it('redondea a entero, para no dejar padding fraccionario', () => {
    expect(keyboardInsetFrom(844, 507.6, 0)).toBe(336)
  })
})
