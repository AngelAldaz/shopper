import { lazy, Suspense } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { money } from '@/lib/money'
import { relativeDate } from '@/lib/dates'
import { usePriceHistory, type StoreHistory } from '@/db/priceHistory'

// recharts es pesado (~100 KB). Se carga solo cuando de verdad hay una gráfica
// que dibujar, no en el bundle inicial que abre la app.
const PriceChart = lazy(() => import('./PriceChart'))

export function PriceHistory({ productId }: { productId: string }) {
  const history = usePriceHistory(productId)

  // Con un solo punto no hay evolución que mostrar; la gráfica necesita al
  // menos dos precios en algún súper para decir algo.
  const hasTrend = history.some((h) => h.points.length >= 2)
  if (history.length === 0) return null

  return (
    <section className="px-5 pt-6">
      <h2 className="mb-2 text-lg font-semibold">Historial de precios</h2>

      <ul className="mb-4 flex flex-col gap-2">
        {history.map((h) => (
          <DeltaRow key={h.storeId} h={h} />
        ))}
      </ul>

      {hasTrend && (
        <Suspense
          fallback={<div className="h-48 animate-pulse rounded-card bg-surface-2" />}
        >
          <PriceChart history={history} />
        </Suspense>
      )}
    </section>
  )
}

function DeltaRow({ h }: { h: StoreHistory }) {
  return (
    <li className="flex items-center gap-2 rounded-soft bg-surface-2 px-3 py-2">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: h.storeColor }} />
      <span className="min-w-0 flex-1 truncate font-semibold">{h.storeName}</span>
      <span className="font-semibold text-primary-ink">{money(h.current)}</span>
      {h.delta !== null && h.delta !== 0 && (
        <span
          className={
            'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ' +
            (h.delta > 0 ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success')
          }
        >
          {h.delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {h.delta > 0 ? 'Subió' : 'Bajó'} {money(Math.abs(h.delta))}
          {h.previousAt && <span className="opacity-75">· {relativeDate(h.previousAt)}</span>}
        </span>
      )}
    </li>
  )
}
