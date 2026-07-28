import { useState } from 'react'
import { Plus, Store as StoreIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Fab } from '@/components/ui/Fab'
import { Button } from '@/components/ui/Button'
import { useStores, useStoreWinCounts } from '@/db/queries'
import { useHousehold } from '@/features/household/useHousehold'
import { StoreFormSheet } from './StoreFormSheet'
import type { Store } from '@/db/schema'

export function StoresPage() {
  const { household } = useHousehold()
  const stores = useStores()
  const wins = useStoreWinCounts()
  const [editing, setEditing] = useState<Store | null>(null)
  const [creating, setCreating] = useState(false)

  if (!household) return null

  return (
    <>
      <PageHeader
        title="Mis supers"
        subtitle={stores.length ? `${stores.length} tiendas` : 'Dónde compras'}
      />

      {stores.length === 0 ? (
        <EmptyState
          title="Aún no tienes supers"
          description="Agrega las tiendas donde haces el súper para empezar a comparar precios."
          action={
            <Button icon={<Plus size={18} />} onClick={() => setCreating(true)}>
              Agregar súper
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5 px-5">
          {stores.map((s) => {
            const n = wins[s.id] ?? 0
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setEditing(s)}
                  className="flex w-full items-center gap-3 rounded-card border border-border bg-surface p-3 text-left shadow-sweet active:bg-surface-2"
                >
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-full text-white"
                    style={{ backgroundColor: s.color }}
                  >
                    <StoreIcon size={20} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                  {n > 0 && (
                    <span className="shrink-0 rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">
                      {n} {n === 1 ? 'más barato' : 'más baratos'}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Fab icon={<Plus size={26} />} label="Nuevo súper" onClick={() => setCreating(true)} />

      <StoreFormSheet
        open={creating}
        onClose={() => setCreating(false)}
        householdId={household.id}
      />
      <StoreFormSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        householdId={household.id}
        store={editing}
      />
    </>
  )
}
