import { useState } from 'react'
import { Check } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Typeahead } from '@/components/Typeahead'
import { Photo } from '@/components/Photo'
import { money, perUnitLabel } from '@/lib/money'
import { useCatalog } from '@/db/queries'
import { addProductToList } from './addToList'
import { QuantitySheet } from './QuantitySheet'
import { QuickAddSheet } from '@/features/products/QuickAddSheet'
import type { PricedProduct } from '@/lib/pricing'

interface Props {
  open: boolean
  onClose: () => void
  householdId: string
  listId: string
}

/**
 * Agrega productos a una lista con el mismo typeahead de todo el resto: escribe,
 * ve las opciones con su mejor precio, toca, elige cantidad. Si el producto no
 * existe todavía, "Crear" abre la captura sin salir de la lista.
 *
 * No se cierra al agregar: en el súper agregas varias cosas seguidas, y volver
 * a abrir el sheet cada vez sería una fricción tonta.
 */
export function AddItemSheet({ open, onClose, householdId, listId }: Props) {
  const catalog = useCatalog('')
  const [chosen, setChosen] = useState<PricedProduct | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  function flashAdded(name: string) {
    setJustAdded(name)
    setTimeout(() => setJustAdded((n) => (n === name ? null : n)), 1800)
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Agregar a la lista">
        {justAdded && (
          <p className="mb-2 flex items-center gap-1.5 rounded-soft bg-success-soft px-3 py-2 text-sm text-success">
            <Check size={16} /> Agregado: {justAdded}
          </p>
        )}
        <Typeahead
          items={catalog}
          getKey={(p) => p.id}
          getText={(p) => `${p.name} ${p.brand ?? ''}`}
          getLastUsedAt={(p) => (p.last_used_at ? Date.parse(p.last_used_at) : null)}
          placeholder="Busca o crea un producto…"
          autoFocus
          onSelect={(p) => setChosen(p)}
          onCreate={(name) => setCreating(name)}
          renderItem={(p) => (
            <>
              <Photo path={p.bestPhotoPath} alt={p.name} className="size-11" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-sm text-muted">
                  {p.brand ? `${p.brand} · ` : ''}
                  {p.storeCount === 0 ? 'Sin precio' : `${p.storeCount} supers`}
                </span>
              </span>
              {p.bestPrice !== null && (
                <span className="shrink-0 text-right text-sm">
                  <span className="block font-semibold text-primary-ink">{money(p.bestPrice)}</span>
                  <span className="block text-xs text-muted">{perUnitLabel(p.unit)}</span>
                </span>
              )}
            </>
          )}
        />
      </Sheet>

      {/* Elegir cantidad del producto seleccionado. */}
      <QuantitySheet
        open={chosen !== null}
        onClose={() => setChosen(null)}
        productName={chosen?.name ?? ''}
        unit={chosen?.unit ?? 'pieza'}
        onConfirm={async (qty) => {
          if (chosen) {
            await addProductToList(householdId, listId, chosen.id, qty)
            flashAdded(chosen.name)
          }
          setChosen(null)
        }}
      />

      {/* Crear un producto que no existía, sin salir de la lista. */}
      <QuickAddSheet
        open={creating !== null}
        onClose={() => setCreating(null)}
        householdId={householdId}
        initialName={creating ?? ''}
        onCreated={async (productId) => {
          // Recién creado: se agrega con cantidad 1 y ya se ajusta luego si hace
          // falta. Encadenar otro sheet de cantidad aquí sería un paso de más.
          await addProductToList(householdId, listId, productId, 1)
          setCreating(null)
        }}
      />
    </>
  )
}
