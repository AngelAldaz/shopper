import { describe, expect, it } from 'vitest'
import { formatListForShare } from './shareList'
import type { ResolvedListItem } from '@/db/lists'
import type { Unit } from '@/lib/money'

function item(
  name: string,
  qty: number,
  unit: Unit,
  store: string | null,
  subtotal: number | null,
  color: string | null = '#000',
): ResolvedListItem {
  return {
    id: name,
    household_id: 'h',
    list_id: 'l',
    product_id: name,
    quantity: qty,
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
    unit,
    resolved: {
      storeId: store,
      storeName: store,
      storeColor: color,
      unitPrice: subtotal,
      photoPath: null,
      subtotal,
    },
  }
}

// 24 de julio de 2026, fijo para que la prueba no dependa del reloj.
const NOW = Date.parse('2026-07-24T12:00:00')

describe('formatListForShare', () => {
  it('agrupa por súper con subtotales y total', () => {
    const texto = formatListForShare(
      'Despensa',
      [
        item('Huevo blanco', 2, 'pieza', 'Walmart', 124),
        item('Leche', 1, 'l', 'Walmart', 24),
        item('Aguacate', 0.5, 'kg', 'Soriana', 44.5),
      ],
      NOW,
    )

    expect(texto).toContain('🛒 Despensa · 24 de julio')
    // Walmart primero: gasta más (148 > 44.50).
    expect(texto.indexOf('Walmart')).toBeLessThan(texto.indexOf('Soriana'))
    expect(texto).toContain('📍 Walmart  $148.00')
    expect(texto).toContain(' • Huevo blanco 2 piezas — $124.00')
    // El gramaje se lee en gramos cuando es menos de un kilo.
    expect(texto).toContain(' • Aguacate 500 g — $44.50')
    expect(texto).toContain('Total aprox: $192.50')
  })

  it('avisa de los productos sin precio, en su propia sección', () => {
    const texto = formatListForShare(
      'Súper',
      [item('Huevo', 1, 'pieza', 'Walmart', 62), item('Sal', 1, 'pieza', null, null)],
      NOW,
    )
    expect(texto).toContain('📝 Falta precio')
    expect(texto).toContain(' • Sal 1 pieza')
    expect(texto).toContain('(faltan 1 precio)')
    // El total solo cuenta lo que tiene precio.
    expect(texto).toContain('Total aprox: $62.00')
  })

  it('no deja la sección "falta precio" con un subtotal en dinero', () => {
    const texto = formatListForShare('L', [item('Sal', 1, 'pieza', null, null)], NOW)
    // La cabecera de esa sección es "Falta precio", nunca "Falta precio $0.00".
    expect(texto).toMatch(/📝 Falta precio\n/)
    expect(texto).not.toContain('Falta precio  $')
  })
})
