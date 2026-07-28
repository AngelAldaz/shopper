import { describe, expect, it } from 'vitest'
import { parsePrice } from './parsePrice'

describe('parsePrice', () => {
  it('lee un precio simple', () => {
    expect(parsePrice('62')).toBe(62)
    expect(parsePrice('58.50')).toBe(58.5)
  })

  it('acepta coma como decimal (teclado en español)', () => {
    expect(parsePrice('45,90')).toBe(45.9)
  })

  it('entiende los miles con el decimal al final', () => {
    expect(parsePrice('1,299.50')).toBe(1299.5)
    expect(parsePrice('1.299,50')).toBe(1299.5)
  })

  it('ignora el signo de pesos y los espacios', () => {
    expect(parsePrice(' $ 89.90 ')).toBe(89.9)
  })

  it('redondea a dos decimales', () => {
    expect(parsePrice('12.999')).toBe(13)
  })

  it('rechaza lo que no es un precio válido', () => {
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('abc')).toBeNull()
    expect(parsePrice('0')).toBeNull()
    expect(parsePrice('-5')).toBe(5) // el signo se descarta; 5 es válido
  })
})
