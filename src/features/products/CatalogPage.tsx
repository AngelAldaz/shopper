import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Photo } from '@/components/Photo'
import { Typeahead } from '@/components/Typeahead'
import { EmptyState } from '@/components/ui/EmptyState'
import { Fab } from '@/components/ui/Fab'
import { Button } from '@/components/ui/Button'
import { money, perUnitLabel } from '@/lib/money'
import { useCatalog, useCatalogCount } from '@/db/queries'
import { useHousehold } from '@/features/household/useHousehold'
import { saveRow } from '@/db/mutate'
import { QuickAddSheet } from './QuickAddSheet'
import type { PricedProduct } from '@/lib/pricing'

export function CatalogPage() {
  const navigate = useNavigate()
  const { household } = useHousehold()
  // El Typeahead hace todo el filtrado y el ranking; aquí solo se le entrega el
  // catálogo entero con su mejor precio ya resuelto.
  const catalog = useCatalog('')
  const total = useCatalogCount()

  const [creating, setCreating] = useState(false)
  const [prefillName, setPrefillName] = useState('')

  if (!household) return null

  function openWith(name: string) {
    setPrefillName(name)
    setCreating(true)
  }

  async function open(p: PricedProduct) {
    // Marcar el uso al abrir: el typeahead usa last_used_at para subir lo que
    // más ocupas. Va por la vía normal, así que también viaja al otro teléfono.
    await saveRow('products', { id: p.id, household_id: household!.id, last_used_at: new Date().toISOString() })
    navigate(`/producto/${p.id}`)
  }

  return (
    <>
      <PageHeader
        title="Catálogo"
        subtitle={total ? `${total} ${total === 1 ? 'producto' : 'productos'}` : 'Tu despensa'}
      />

      {total === 0 ? (
        <EmptyState
          title="Tu catálogo está vacío"
          description="Agrega tu primer producto con foto y precio. Se irá llenando poco a poco, súper a súper."
          action={
            <Button icon={<Plus size={18} />} onClick={() => openWith('')}>
              Agregar producto
            </Button>
          }
        />
      ) : (
        <div className="px-5">
          <Typeahead
            items={catalog}
            getKey={(p) => p.id}
            getText={(p) => `${p.name} ${p.brand ?? ''}`}
            getLastUsedAt={(p) => (p.last_used_at ? Date.parse(p.last_used_at) : null)}
            placeholder="Busca un producto…"
            onSelect={open}
            onCreate={openWith}
            renderItem={(p) => (
              <>
                <Photo path={p.bestPhotoPath} alt={p.name} className="size-12" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {p.brand ? `${p.brand} · ` : ''}
                    {p.storeCount === 0
                      ? 'Sin precio'
                      : `en ${p.storeCount} ${p.storeCount === 1 ? 'súper' : 'supers'}`}
                  </span>
                </span>
                {p.bestPrice !== null && (
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold text-primary-ink">
                      {money(p.bestPrice)}
                    </span>
                    <span className="block text-xs text-muted">{perUnitLabel(p.unit)}</span>
                  </span>
                )}
              </>
            )}
          />
        </div>
      )}

      <Fab icon={<Plus size={26} />} label="Nuevo producto" onClick={() => openWith('')} />

      <QuickAddSheet
        open={creating}
        onClose={() => setCreating(false)}
        householdId={household.id}
        initialName={prefillName}
        onCreated={(id) => navigate(`/producto/${id}`)}
      />
    </>
  )
}
