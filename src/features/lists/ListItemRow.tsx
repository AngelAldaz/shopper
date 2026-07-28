import { Check } from 'lucide-react'
import { Photo } from '@/components/Photo'
import { money, formatQuantity } from '@/lib/money'
import { cn } from '@/lib/cn'
import type { ResolvedListItem } from '@/db/lists'

interface Props {
  item: ResolvedListItem
  /** Muestra el chip del súper (en la vista "Todo", no en la de "por súper"). */
  showStore?: boolean
  onToggle: () => void
  onEdit?: () => void
}

/** Un renglón de lista: foto, nombre, cantidad, súper y subtotal, con tachado. */
export function ListItemRow({ item, showStore = true, onToggle, onEdit }: Props) {
  const { resolved } = item
  const checked = item.is_checked

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-sweet transition-opacity',
        checked && 'opacity-55',
      )}
    >
      {/* El check es un objetivo grande y aparte: es el gesto que más se repite
          en el súper y tiene que acertarse sin mirar. */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={checked ? `Desmarcar ${item.productName}` : `Marcar ${item.productName}`}
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-full border-2 transition-colors',
          checked
            ? 'animate-pop border-success bg-success text-white'
            : 'border-border text-transparent active:border-primary',
        )}
      >
        <Check size={22} strokeWidth={3} />
      </button>

      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Photo path={resolved.photoPath} alt="" className="size-12 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate font-semibold', checked && 'line-through')}>
            {item.productName}
          </span>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <span>{formatQuantity(item.quantity, item.unit)}</span>
            {showStore && resolved.storeName && (
              <>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1 truncate">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: resolved.storeColor ?? '#ccc' }}
                  />
                  {resolved.storeName}
                </span>
              </>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {resolved.subtotal !== null ? (
            <span className="font-semibold text-primary-ink">{money(resolved.subtotal)}</span>
          ) : (
            <span className="text-sm text-warning">sin precio</span>
          )}
        </span>
      </button>
    </div>
  )
}
