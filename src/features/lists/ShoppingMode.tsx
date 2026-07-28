import { useMemo } from 'react'
import { Check, X } from 'lucide-react'
import { formatQuantity, money } from '@/lib/money'
import { groupByStore } from './byStore'
import { useWakeLock } from '@/hooks/useWakeLock'
import { cn } from '@/lib/cn'
import type { ResolvedListItem } from '@/db/lists'

interface Props {
  listName: string
  items: ResolvedListItem[]
  onToggle: (item: ResolvedListItem) => void
  onExit: () => void
}

/**
 * Modo pasillo. Pensado para usarse con una mano recorriendo el súper:
 *  · solo lo que FALTA, agrupado por súper y ya ordenado por gasto;
 *  · tipografía grande y objetivos de toque enormes, para acertar sin mirar;
 *  · la pantalla no se apaga (wake lock).
 *
 * Lo tachado desaparece de la vista en cuanto se marca: la lista se va vaciando
 * conforme echas cosas al carrito, que es justo la sensación que quieres ahí.
 */
export function ShoppingMode({ listName, items, onToggle, onExit }: Props) {
  useWakeLock(true)

  const pending = useMemo(() => items.filter((i) => !i.is_checked), [items])
  const groups = useMemo(() => groupByStore(pending), [pending])
  const done = items.length - pending.length

  return (
    <div className="min-h-dvh bg-bg">
      <header className="safe-top sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={onExit}
          aria-label="Salir del modo compra"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted active:bg-surface-2"
        >
          <X size={24} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{listName}</h1>
          <p className="text-sm text-muted">
            {pending.length === 0
              ? '¡Terminaste! 💕'
              : `${done}/${items.length} en el carrito`}
          </p>
        </div>
      </header>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-8 py-20 text-center">
          <div className="animate-pop grid size-20 place-items-center rounded-full bg-success text-white">
            <Check size={44} strokeWidth={3} />
          </div>
          <h2 className="text-2xl font-semibold">¡Todo listo!</h2>
          <p className="text-muted">Echaste todo al carrito.</p>
        </div>
      ) : (
        <div className="safe-bottom flex flex-col gap-6 px-4 py-4 pb-24">
          {groups.map((g) => (
            <section key={g.storeId ?? 'missing'}>
              <header className="mb-2 flex items-center gap-2 px-1">
                <span
                  className="size-3.5 rounded-full"
                  style={{ backgroundColor: g.storeColor ?? '#B8730E' }}
                />
                <h2 className="text-lg font-semibold">{g.storeName}</h2>
                <span className="text-muted">({g.items.length})</span>
              </header>
              <ul className="flex flex-col gap-2.5">
                {g.items.map((item) => (
                  <li key={item.id}>
                    {/* Todo el renglón es el botón de tachar: en el súper no hay
                        tiempo de apuntar a un checkbox chico. */}
                    <button
                      type="button"
                      onClick={() => onToggle(item)}
                      className={cn(
                        'flex w-full items-center gap-4 rounded-card border border-border bg-surface p-4 text-left',
                        'shadow-sweet active:scale-[0.99] active:bg-surface-2',
                      )}
                    >
                      <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-border text-transparent">
                        <Check size={26} strokeWidth={3} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-semibold">
                          {item.productName}
                        </span>
                        <span className="text-muted">
                          {formatQuantity(item.quantity, item.unit)}
                        </span>
                      </span>
                      {item.resolved.subtotal !== null && (
                        <span className="shrink-0 text-lg font-semibold text-primary-ink">
                          {money(item.resolved.subtotal)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
