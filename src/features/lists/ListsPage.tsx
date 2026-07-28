import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Fab } from '@/components/ui/Fab'
import { Button } from '@/components/ui/Button'
import { approx } from '@/lib/money'
import { useLists } from '@/db/lists'
import { useHousehold } from '@/features/household/useHousehold'
import { NewListSheet } from './NewListSheet'

export function ListsPage() {
  const navigate = useNavigate()
  const { household } = useHousehold()
  const lists = useLists()
  const [creating, setCreating] = useState(false)

  if (!household) return null

  return (
    <>
      <PageHeader
        title="Mis listas"
        subtitle={lists.length ? `${lists.length} ${lists.length === 1 ? 'lista' : 'listas'}` : 'Tu súper'}
      />

      {lists.length === 0 ? (
        <EmptyState
          title="Empieza tu primera lista"
          description="Agrega lo que necesitas y te decimos en qué súper sale más barato cada cosa."
          action={
            <Button icon={<Plus size={18} />} onClick={() => setCreating(true)}>
              Nueva lista
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3 px-5">
          {lists.map((l) => {
            const pct = l.total ? Math.round((l.checked / l.total) * 100) : 0
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/listas/${l.id}`)}
                  className="w-full rounded-card border border-border bg-surface p-4 text-left shadow-sweet active:bg-surface-2"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{l.name}</h2>
                    {l.estimated > 0 && (
                      <span className="shrink-0 font-semibold text-primary-ink">
                        {approx(l.estimated)}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-3 text-sm text-muted">
                    <span>
                      {l.total === 0
                        ? 'Vacía'
                        : `${l.checked}/${l.total} · ${l.total === 1 ? 'producto' : 'productos'}`}
                    </span>
                    {l.missingPrices > 0 && (
                      <span className="text-warning">
                        faltan {l.missingPrices} {l.missingPrices === 1 ? 'precio' : 'precios'}
                      </span>
                    )}
                  </div>

                  {l.total > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Fab icon={<Plus size={26} />} label="Nueva lista" onClick={() => setCreating(true)} />

      <NewListSheet
        open={creating}
        onClose={() => setCreating(false)}
        householdId={household.id}
        onCreated={(id) => navigate(`/listas/${id}`)}
      />
    </>
  )
}
