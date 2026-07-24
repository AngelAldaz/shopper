import { PageHeader } from '@/components/PageHeader'
import { Typeahead } from '@/components/Typeahead'
import { money, perUnitLabel, type Unit } from '@/lib/money'

/**
 * TEMPORAL (Fase 0): datos falsos para poder sentir el typeahead antes de que
 * exista la base de datos. Se borra en la Fase 5, cuando el catálogo salga del
 * espejo local.
 */
interface FakeProduct {
  id: string
  name: string
  brand: string | null
  unit: Unit
  price: number
  store: string
  storeColor: string
}

const DEMO: FakeProduct[] = [
  { id: '1', name: 'Huevo blanco', brand: 'San Juan', unit: 'pieza', price: 62, store: 'Walmart', storeColor: '#2E77BB' },
  { id: '2', name: 'Huevo de codorniz', brand: null, unit: 'pieza', price: 38.5, store: 'La Comer', storeColor: '#7C5CD6' },
  { id: '3', name: 'Hierbas finas', brand: 'McCormick', unit: 'pieza', price: 24.9, store: 'Soriana', storeColor: '#D94F4F' },
  { id: '4', name: 'Harina de trigo', brand: 'Tres Estrellas', unit: 'kg', price: 32, store: 'Bodega Aurrerá', storeColor: '#E8A33D' },
  { id: '5', name: 'Hielo', brand: null, unit: 'kg', price: 28, store: 'Chedraui', storeColor: '#E8623D' },
  { id: '6', name: 'Leche entera', brand: 'Lala', unit: 'l', price: 24, store: 'Walmart', storeColor: '#2E77BB' },
  { id: '7', name: 'Piña', brand: null, unit: 'kg', price: 22.5, store: 'Mercado', storeColor: '#2E8B6B' },
  { id: '8', name: 'Aguacate hass', brand: null, unit: 'kg', price: 89.9, store: 'Soriana', storeColor: '#D94F4F' },
]

export function CatalogPage() {
  return (
    <>
      <PageHeader title="Catálogo" subtitle={`${DEMO.length} productos de muestra`} />

      <div className="px-5">
        <Typeahead
          items={DEMO}
          getKey={(p) => p.id}
          getText={(p) => `${p.name} ${p.brand ?? ''}`}
          placeholder="Busca un producto…"
          onSelect={() => {}}
          onCreate={() => {}}
          renderItem={(p) => (
            <>
              <span
                className="grid size-12 shrink-0 place-items-center rounded-soft text-lg font-semibold text-white"
                style={{ backgroundColor: p.storeColor }}
                aria-hidden="true"
              >
                {p.name.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-sm text-muted">
                  {p.brand ? `${p.brand} · ` : ''}
                  {p.store}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold text-primary-ink">{money(p.price)}</span>
                <span className="block text-xs text-muted">{perUnitLabel(p.unit)}</span>
              </span>
            </>
          )}
        />
      </div>
    </>
  )
}
