import { money, formatQuantity } from '@/lib/money'
import { longDate } from '@/lib/dates'
import { groupByStore, listTotal } from './byStore'
import type { ResolvedListItem } from '@/db/lists'

/**
 * Arma el texto de la lista para compartir por WhatsApp / Notas.
 *
 * Se agrupa por súper y no por orden de captura porque quien recibe el texto lo
 * usa para ir de compras: necesita saber qué llevar en cada tienda, igual que
 * la vista "por súper" de la app. Función pura para poder probar el formato sin
 * navegador.
 */
export function formatListForShare(
  listName: string,
  items: ResolvedListItem[],
  now: number = Date.now(),
): string {
  const groups = groupByStore(items)
  const { total, missing } = listTotal(items)
  const lines: string[] = [`🛒 ${listName} · ${longDate(now)}`, '']

  for (const g of groups) {
    if (g.hasMissing) {
      lines.push(`📝 Falta precio`)
    } else {
      lines.push(`📍 ${g.storeName}  ${money(g.subtotal)}`)
    }
    for (const item of g.items) {
      const qty = formatQuantity(item.quantity, item.unit)
      const price = item.resolved.subtotal !== null ? ` — ${money(item.resolved.subtotal)}` : ''
      lines.push(` • ${item.productName} ${qty}${price}`)
    }
    lines.push('')
  }

  lines.push(`Total aprox: ${money(total)}`)
  if (missing > 0) {
    lines.push(`(faltan ${missing} ${missing === 1 ? 'precio' : 'precios'})`)
  }

  return lines.join('\n').trim()
}
