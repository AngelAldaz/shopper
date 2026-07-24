import { describe, expect, it } from 'vitest'
import { rank, recencyBonus, scoreText } from './search'

interface P {
  name: string
  lastUsedAt?: number | null
}

const CATALOGO: P[] = [
  { name: 'Huevo blanco' },
  { name: 'Huevo de codorniz' },
  { name: 'Hierbas finas' },
  { name: 'Harina de trigo' },
  { name: 'Hielo' },
  { name: 'Leche entera' },
  { name: 'Piña' },
]

const names = (items: P[]) => items.map((p) => p.name)
const buscar = (q: string) => names(rank(CATALOGO, q, { getText: (p) => p.name, now: 0 }))

describe('scoreText', () => {
  it('premia el prefijo del texto por encima del prefijo de palabra', () => {
    expect(scoreText('Huevo blanco', 'hu')).toBeGreaterThan(scoreText('Hierbas finas', 'fin'))
  })

  it('encuentra por prefijo de cualquier palabra', () => {
    expect(scoreText('Hierbas finas', 'fin')).toBe(60)
  })

  it('encuentra por coincidencia interna, pero puntúa más bajo', () => {
    expect(scoreText('Huevo blanco', 'uev')).toBe(25)
  })

  it('no busca dentro de la palabra con 1 o 2 letras', () => {
    // Si lo hiciera, teclear "h" traería "leche" y la primera pantalla del
    // typeahead sería ruido en vez de las opciones que empiezan por h.
    expect(scoreText('Leche entera', 'h')).toBe(0)
    expect(scoreText('Leche entera', 'ch')).toBe(0)
    expect(scoreText('Leche entera', 'che')).toBe(25)
  })

  it('ignora acentos en los dos sentidos', () => {
    expect(scoreText('Piña', 'pina')).toBe(100)
    expect(scoreText('Pina colada', 'piñ')).toBe(100)
    expect(scoreText('Azúcar', 'azu')).toBe(100)
  })

  it('con varias palabras exige que todas aparezcan', () => {
    expect(scoreText('Huevo blanco', 'huevo bl')).toBeGreaterThan(0)
    expect(scoreText('Pan blanco', 'huevo bl')).toBe(0)
  })

  it('una consulta vacía deja pasar todo', () => {
    expect(scoreText('lo que sea', '')).toBe(1)
    expect(scoreText('lo que sea', '   ')).toBe(1)
  })
})

describe('rank — el filtrado progresivo que pidió el usuario', () => {
  it('sin consulta muestra el catálogo completo', () => {
    expect(buscar('')).toHaveLength(CATALOGO.length)
  })

  it('con "h" muestra todas las opciones que empiezan con h', () => {
    expect(buscar('h')).toEqual([
      'Harina de trigo',
      'Hielo',
      'Hierbas finas',
      'Huevo blanco',
      'Huevo de codorniz',
    ])
  })

  it('con "hu" se reduce a los huevos', () => {
    expect(buscar('hu')).toEqual(['Huevo blanco', 'Huevo de codorniz'])
  })

  it('con "huev" sigue habiendo dos, y con "huevo b" ya solo uno', () => {
    expect(buscar('huev')).toHaveLength(2)
    expect(buscar('huevo b')).toEqual(['Huevo blanco'])
  })

  it('no inventa resultados cuando no hay nada', () => {
    expect(buscar('zzz')).toEqual([])
  })

  it('desempata alfabéticamente para que la lista no baile al escribir', () => {
    // Ambos empiezan con "huevo": misma puntuación, orden estable.
    expect(buscar('huevo')).toEqual(['Huevo blanco', 'Huevo de codorniz'])
  })

  it('lo usado hace poco sube, sin tapar una coincidencia mejor', () => {
    const items: P[] = [
      { name: 'Leche entera', lastUsedAt: null },
      { name: 'Leche deslactosada', lastUsedAt: 0 },
    ]
    const now = 0
    const ordenado = rank(items, 'leche', {
      getText: (p) => p.name,
      getLastUsedAt: (p) => p.lastUsedAt,
      now,
    })
    expect(ordenado[0]?.name).toBe('Leche deslactosada')
  })

  it('respeta el límite', () => {
    expect(rank(CATALOGO, 'h', { getText: (p) => p.name, limit: 2 })).toHaveLength(2)
  })
})

describe('recencyBonus', () => {
  const DAY = 86_400_000

  it('vale 0 si nunca se usó', () => {
    expect(recencyBonus(null, 0)).toBe(0)
    expect(recencyBonus(undefined, 0)).toBe(0)
  })

  it('cae de forma suave y nunca supera el peso de una coincidencia', () => {
    const hoy = recencyBonus(0, 0)
    const diezDias = recencyBonus(0, 10 * DAY)
    const dosMeses = recencyBonus(0, 60 * DAY)

    expect(hoy).toBeCloseTo(30, 5)
    expect(diezDias).toBeLessThan(hoy)
    expect(dosMeses).toBeLessThan(diezDias)
    // Tiene que quedar por debajo de 35 (100 - 60 - 5) o un producto "reciente"
    // con coincidencia débil adelantaría a uno con prefijo exacto.
    expect(hoy).toBeLessThan(35)
  })
})
