import { describe, expect, it } from 'vitest'
import { norm, words } from './norm'

/**
 * Estos casos son exactamente los que rompieron la primera versión de la
 * función SQL: la cadena destino de `translate()` era más corta que la origen,
 * así que la "ñ" caía fuera del mapeo y se convertía en otra letra.
 * El mismo arreglo tiene que valer en Postgres y aquí.
 */
describe('norm', () => {
  it('quita acentos de las vocales', () => {
    expect(norm('azúcar')).toBe('azucar')
    expect(norm('jamón')).toBe('jamon')
    expect(norm('café')).toBe('cafe')
    expect(norm('kiwi ácido')).toBe('kiwi acido')
  })

  it('convierte ñ en n sin corromper el resto', () => {
    expect(norm('piña')).toBe('pina')
    expect(norm('ñame')).toBe('name')
    expect(norm('leche del año')).toBe('leche del ano')
    expect(norm('Piñata Ñoño')).toBe('pinata nono')
  })

  it('maneja diéresis y cedilla', () => {
    expect(norm('pingüino')).toBe('pinguino')
    expect(norm('açaí')).toBe('acai')
  })

  it('normaliza mayúsculas y espacios sobrantes', () => {
    expect(norm('  HUEVO   BLANCO  ')).toBe('huevo blanco')
  })

  it('tolera nulos', () => {
    expect(norm(null)).toBe('')
    expect(norm(undefined)).toBe('')
    expect(norm('')).toBe('')
  })

  it('parte en palabras normalizadas', () => {
    expect(words('Hierbas Finas')).toEqual(['hierbas', 'finas'])
    expect(words('  ')).toEqual([])
  })
})
