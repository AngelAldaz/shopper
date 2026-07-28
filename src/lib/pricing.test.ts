import { describe, expect, it } from 'vitest'
import { bestPrices, cheapest, resolveListItem } from './pricing'
import type { Product, ProductPrice, Store } from '@/db/schema'

/**
 * Estas pruebas son el contrato entre el cálculo del cliente (este archivo) y
 * las vistas SQL de supabase/migrations/0007. Cada caso aquí tiene su gemelo en
 * supabase/tests/schema_test.sql; si alguno cambia, hay que cambiar los dos, o
 * la lista elegiría un súper distinto con y sin conexión.
 */

const base = {
  household_id: 'h1',
  created_at: '2026-07-24T10:00:00.000Z',
  updated_at: '2026-07-24T10:00:00.000Z',
  deleted_at: null,
  created_by: null,
  updated_by: null,
}

function prod(id: string, name: string, unit: Product['unit'] = 'pieza'): Product {
  return { ...base, id, name, brand: null, unit, photo_path: null, notes: null, last_used_at: null }
}

function price(
  id: string,
  productId: string,
  storeId: string,
  amount: number,
  updated = '2026-07-24T10:00:00.000Z',
): ProductPrice {
  return {
    ...base,
    id,
    product_id: productId,
    store_id: storeId,
    price: amount,
    photo_path: null,
    package_note: null,
    updated_at: updated,
  }
}

const store = (id: string, name: string): Store => ({ ...base, id, name, color: '#000' })

describe('cheapest', () => {
  it('elige el precio más bajo', () => {
    const r = cheapest([price('a', 'p', 's1', 62), price('b', 'p', 's2', 58.5), price('c', 'p', 's3', 71)])
    expect(r?.store_id).toBe('s2')
  })

  it('ante empate gana el capturado más recientemente', () => {
    const r = cheapest([
      price('a', 'p', 's1', 50, '2026-07-24T10:00:00.000Z'),
      price('b', 'p', 's2', 50, '2026-07-24T12:00:00.000Z'),
    ])
    expect(r?.store_id).toBe('s2')
  })

  it('devuelve null si no hay precios', () => {
    expect(cheapest([])).toBeNull()
  })
})

describe('bestPrices — gemelo de la vista best_prices', () => {
  const products = [prod('huevo', 'Huevo blanco'), prod('pina', 'Piña', 'kg')]
  const stores = [store('s1', 'Walmart'), store('s2', 'Soriana'), store('s3', 'Chedraui')]

  it('elige el súper más barato de los tres', () => {
    const prices = [
      price('a', 'huevo', 's1', 62),
      price('b', 'huevo', 's2', 58.5),
      price('c', 'huevo', 's3', 71),
    ]
    const [huevo] = bestPrices([products[0]!], prices, stores)
    expect(huevo?.bestStoreId).toBe('s2')
    expect(huevo?.bestPrice).toBe(58.5)
    expect(huevo?.storeCount).toBe(3)
  })

  it('un producto sin precios sale con súper null en vez de desaparecer', () => {
    const [pina] = bestPrices([products[1]!], [], stores)
    expect(pina?.bestStoreId).toBeNull()
    expect(pina?.bestPrice).toBeNull()
    expect(pina?.storeCount).toBe(0)
  })

  it('trae la foto del súper ganador, no la genérica', () => {
    const conFoto = { ...price('a', 'huevo', 's1', 50), photo_path: 'h1/foto-walmart.webp' }
    const [huevo] = bestPrices([products[0]!], [conFoto], stores)
    expect(huevo?.bestPhotoPath).toBe('h1/foto-walmart.webp')
  })

  it('si el precio ganador no tiene foto, cae a la genérica del producto', () => {
    const productoConFoto = { ...prod('huevo', 'Huevo'), photo_path: 'h1/generica.webp' }
    const [huevo] = bestPrices([productoConFoto], [price('a', 'huevo', 's1', 50)], stores)
    expect(huevo?.bestPhotoPath).toBe('h1/generica.webp')
  })
})

describe('resolveListItem — gemelo de list_items_resolved', () => {
  const huevo = prod('huevo', 'Huevo blanco')
  const aguacate = prod('aguacate', 'Aguacate', 'kg')
  const stores = new Map([
    ['s1', store('s1', 'Walmart')],
    ['s2', store('s2', 'Soriana')],
  ])
  const preciosHuevo = [price('a', 'huevo', 's1', 62), price('b', 'huevo', 's2', 58.5)]

  it('sin súper fijado, usa el más barato', () => {
    const r = resolveListItem(1, null, huevo, preciosHuevo, stores)
    expect(r.storeId).toBe('s2')
    expect(r.subtotal).toBe(58.5)
  })

  it('fijar un súper a mano gana sobre el más barato, con SU precio', () => {
    const r = resolveListItem(1, 's1', huevo, preciosHuevo, stores)
    expect(r.storeId).toBe('s1')
    expect(r.unitPrice).toBe(62)
  })

  it('EL CASO DEL COALESCE CONJUNTO: si el precio fijado se borró, súper e importe caen juntos', () => {
    // Fijó Walmart (s1), pero ese precio ya no está en la lista (se borró).
    const soloSoriana = [price('b', 'huevo', 's2', 58.5)]
    const r = resolveListItem(1, 's1', huevo, soloSoriana, stores)
    // No debe salir "Walmart con $58.50": cae entero a Soriana.
    expect(r.storeId).toBe('s2')
    expect(r.unitPrice).toBe(58.5)
  })

  it('gramaje: 500 g de un producto a 89.90 por kilo dan 44.95', () => {
    const precios = [price('a', 'aguacate', 's1', 89.9)]
    const r = resolveListItem(0.5, null, aguacate, precios, stores)
    expect(r.subtotal).toBe(44.95)
  })

  it('producto sin ningún precio: súper null pero sigue en la lista', () => {
    const r = resolveListItem(2, null, huevo, [], stores)
    expect(r.storeId).toBeNull()
    expect(r.subtotal).toBeNull()
  })
})
