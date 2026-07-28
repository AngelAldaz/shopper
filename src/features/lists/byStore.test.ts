import { describe, expect, it } from 'vitest'
import { groupByStore, listTotal } from './byStore'
import type { ResolvedListItem } from '@/db/lists'

function item(
  name: string,
  storeId: string | null,
  storeName: string | null,
  subtotal: number | null,
): ResolvedListItem {
  return {
    id: name,
    household_id: 'h',
    list_id: 'l',
    product_id: name,
    quantity: 1,
    pinned_store_id: null,
    is_checked: false,
    checked_at: null,
    note: null,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    created_by: null,
    updated_by: null,
    productName: name,
    brand: null,
    unit: 'pieza',
    resolved: {
      storeId,
      storeName,
      storeColor: null,
      unitPrice: subtotal,
      photoPath: null,
      subtotal,
    },
  }
}

describe('groupByStore', () => {
  const items = [
    item('Huevo', 's1', 'Walmart', 62),
    item('Leche', 's1', 'Walmart', 48),
    item('Aguacate', 's2', 'Soriana', 44.5),
    item('Sal', null, null, null), // sin precio
  ]

  it('agrupa por súper con su subtotal', () => {
    const groups = groupByStore(items)
    const walmart = groups.find((g) => g.storeId === 's1')
    expect(walmart?.items).toHaveLength(2)
    expect(walmart?.subtotal).toBe(110)
  })

  it('pone el súper con más gasto primero', () => {
    const groups = groupByStore(items)
    expect(groups[0]?.storeId).toBe('s1') // Walmart 110 > Soriana 44.5
  })

  it('manda "falta precio" al final, aunque haya varios', () => {
    const groups = groupByStore(items)
    expect(groups[groups.length - 1]?.hasMissing).toBe(true)
  })

  it('no ensucia el subtotal con los renglones sin precio', () => {
    const groups = groupByStore(items)
    const missing = groups.find((g) => g.hasMissing)
    expect(missing?.subtotal).toBe(0)
    expect(missing?.items).toHaveLength(1)
  })
})

describe('listTotal', () => {
  it('suma solo lo que tiene precio y cuenta lo que falta', () => {
    const r = listTotal([
      item('a', 's1', 'W', 62),
      item('b', 's2', 'S', 44.5),
      item('c', null, null, null),
    ])
    expect(r.total).toBe(106.5)
    expect(r.missing).toBe(1)
  })

  it('no arrastra coma flotante', () => {
    const r = listTotal([item('a', 's1', 'W', 0.1), item('b', 's1', 'W', 0.2)])
    expect(r.total).toBe(0.3)
  })
})
