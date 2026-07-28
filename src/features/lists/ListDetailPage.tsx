import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ChevronLeft, Plus, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Fab } from '@/components/ui/Fab'
import { approx } from '@/lib/money'
import { saveRow } from '@/db/mutate'
import { useListItems, useList } from '@/db/lists'
import { useHousehold } from '@/features/household/useHousehold'
import { ListItemRow } from './ListItemRow'
import { AddItemSheet } from './AddItemSheet'
import { QuantitySheet } from './QuantitySheet'
import { ShoppingMode } from './ShoppingMode'
import { groupByStore, listTotal } from './byStore'
import { cn } from '@/lib/cn'
import type { ResolvedListItem } from '@/db/lists'

type View = 'todo' | 'super'

export function ListDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { household } = useHousehold()
  const list = useList(id)
  const items = useListItems(id)

  const [view, setView] = useState<View>('todo')
  const [adding, setAdding] = useState(false)
  const [shopping, setShopping] = useState(false)
  const [editing, setEditing] = useState<ResolvedListItem | null>(null)

  const groups = useMemo(() => groupByStore(items), [items])
  const { total, missing } = useMemo(() => listTotal(items), [items])
  const pending = items.filter((i) => !i.is_checked).length

  if (!household) return null
  if (!list) {
    return (
      <div className="p-8 text-center text-muted">
        <p>Esta lista ya no existe.</p>
        <Button variant="ghost" className="mt-3" onClick={() => navigate('/')}>
          Volver a mis listas
        </Button>
      </div>
    )
  }

  async function toggle(item: ResolvedListItem) {
    await saveRow('list_items', {
      id: item.id,
      household_id: household!.id,
      is_checked: !item.is_checked,
      checked_at: item.is_checked ? null : new Date().toISOString(),
    })
  }

  if (shopping) {
    return (
      <ShoppingMode
        listName={list.name}
        items={items}
        onToggle={toggle}
        onExit={() => setShopping(false)}
      />
    )
  }

  return (
    <>
      <header className="safe-top flex items-center gap-1 px-3 pt-3 pb-1">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Volver"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted active:bg-surface-2"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{list.name}</h1>
      </header>

      {/* Total sticky: la cifra que importa siempre a la vista, aunque scrollees. */}
      {items.length > 0 && (
        <div className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b border-border bg-bg/95 px-5 py-2 backdrop-blur">
          <span className="text-sm text-muted">
            {pending === 0 ? '¡Todo listo!' : `${pending} por comprar`}
          </span>
          <span className="text-right">
            <span className="text-lg font-semibold text-primary-ink">{approx(total)}</span>
            {missing > 0 && (
              <span className="block text-xs text-warning">
                faltan {missing} {missing === 1 ? 'precio' : 'precios'}
              </span>
            )}
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="px-8 py-16 text-center text-muted">
          <p className="text-balance">Lista vacía. Agrega lo que necesitas y te decimos dónde sale más barato.</p>
          <Button className="mt-4" icon={<Plus size={18} />} onClick={() => setAdding(true)}>
            Agregar productos
          </Button>
        </div>
      ) : (
        <>
          <div className="px-5 pt-3">
            <Segmented value={view} onChange={setView} />
          </div>

          <div className="px-5 pt-3">
            {view === 'todo' ? (
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <ListItemRow item={item} onToggle={() => toggle(item)} onEdit={() => setEditing(item)} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col gap-5">
                {groups.map((g) => (
                  <section key={g.storeId ?? 'missing'}>
                    <header className="mb-2 flex items-center justify-between gap-2 px-1">
                      <span className="flex items-center gap-2 font-semibold">
                        <span
                          className="size-3 rounded-full"
                          style={{ backgroundColor: g.storeColor ?? '#B8730E' }}
                        />
                        {g.storeName}
                        <span className="text-sm font-normal text-muted">({g.items.length})</span>
                      </span>
                      {!g.hasMissing && (
                        <span className="font-semibold text-primary-ink">{approx(g.subtotal)}</span>
                      )}
                    </header>
                    <ul className="flex flex-col gap-2">
                      {g.items.map((item) => (
                        <li key={item.id}>
                          <ListItemRow
                            item={item}
                            showStore={false}
                            onToggle={() => toggle(item)}
                            onEdit={() => setEditing(item)}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {items.length > 0 && pending > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-5 pt-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] backdrop-blur">
          <Button size="lg" block icon={<ShoppingCart size={20} />} onClick={() => setShopping(true)}>
            Comprando
          </Button>
        </div>
      )}

      <Fab
        icon={<Plus size={26} />}
        label="Agregar producto"
        onClick={() => setAdding(true)}
        // Sube el FAB por encima de la barra "Comprando".
        className={cn(items.length > 0 && pending > 0 && 'bottom-[calc(9.5rem+env(safe-area-inset-bottom))]')}
      />

      <AddItemSheet
        open={adding}
        onClose={() => setAdding(false)}
        householdId={household.id}
        listId={list.id}
      />

      <QuantitySheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        productName={editing?.productName ?? ''}
        unit={editing?.unit ?? 'pieza'}
        initial={editing?.quantity}
        onConfirm={async (qty) => {
          if (editing) {
            await saveRow('list_items', {
              id: editing.id,
              household_id: household.id,
              quantity: qty,
            })
          }
          setEditing(null)
        }}
      />
    </>
  )
}

function Segmented({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const opts: { value: View; label: string }[] = [
    { value: 'todo', label: 'Todo' },
    { value: 'super', label: 'Por súper' },
  ]
  return (
    <div className="flex gap-1 rounded-full bg-surface-2 p-1">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 flex-1 rounded-full text-sm font-semibold transition-colors',
            value === o.value ? 'bg-surface text-primary-ink shadow-sweet' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
