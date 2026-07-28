import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ChevronLeft, Pencil, Plus } from 'lucide-react'
import { Photo } from '@/components/Photo'
import { Button } from '@/components/ui/Button'
import { money, perUnitLabel } from '@/lib/money'
import { useProduct, useProductPrices, useStores } from '@/db/queries'
import { useHousehold } from '@/features/household/useHousehold'
import { PriceEditorSheet } from './PriceEditorSheet'
import { ProductFormSheet } from './ProductFormSheet'
import { PriceHistory } from './PriceHistory'
import { relativeDate } from '@/lib/dates'
import type { ProductPrice } from '@/db/schema'

export function ProductDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { household } = useHousehold()
  const product = useProduct(id)
  const prices = useProductPrices(id)
  const stores = useStores()

  const [editingProduct, setEditingProduct] = useState(false)
  const [editingPrice, setEditingPrice] = useState<ProductPrice | null>(null)
  const [addingPrice, setAddingPrice] = useState(false)

  const storeById = new Map(stores.map((s) => [s.id, s]))

  if (!household) return null
  if (!product) {
    return (
      <div className="p-8 text-center text-muted">
        <p>Este producto ya no existe.</p>
        <Button variant="ghost" className="mt-3" onClick={() => navigate('/catalogo')}>
          Volver al catálogo
        </Button>
      </div>
    )
  }

  const cheapest = prices[0] // ya vienen ordenados por precio
  const usedStoreIds = prices.map((p) => p.store_id)

  return (
    <>
      <header className="safe-top flex items-center gap-1 px-3 pt-3 pb-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted active:bg-surface-2"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="min-w-0 flex-1" />
        <Button
          variant="ghost"
          size="sm"
          icon={<Pencil size={16} />}
          onClick={() => setEditingProduct(true)}
        >
          Editar
        </Button>
      </header>

      <div className="flex flex-col items-center gap-3 px-5 pb-4 text-center">
        <Photo
          path={cheapest?.photo_path ?? product.photo_path}
          alt={product.name}
          rounded="card"
          className="size-40"
        />
        <div>
          <h1 className="text-2xl font-semibold text-balance">{product.name}</h1>
          {product.brand && <p className="text-muted">{product.brand}</p>}
          <p className="mt-0.5 text-sm text-muted">Precio {perUnitLabel(product.unit)}</p>
        </div>
      </div>

      <div className="px-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Precios por súper</h2>
          <Button
            variant="soft"
            size="sm"
            icon={<Plus size={16} />}
            onClick={() => setAddingPrice(true)}
          >
            Agregar
          </Button>
        </div>

        {prices.length === 0 ? (
          <div className="rounded-card border border-dashed border-border p-6 text-center text-muted">
            <p>Todavía no tiene precios.</p>
            <Button className="mt-3" icon={<Plus size={18} />} onClick={() => setAddingPrice(true)}>
              Agregar el primero
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {prices.map((p) => {
              const store = storeById.get(p.store_id)
              const isCheapest = p.id === cheapest?.id
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setEditingPrice(p)}
                    className="flex w-full items-center gap-3 rounded-card border border-border bg-surface p-3 text-left shadow-sweet active:bg-surface-2"
                  >
                    <Photo path={p.photo_path ?? product.photo_path} alt="" className="size-14" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: store?.color ?? '#ccc' }}
                        />
                        <span className="truncate font-semibold">{store?.name ?? 'Súper'}</span>
                        {isCheapest && (
                          <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                            más barato
                          </span>
                        )}
                      </span>
                      {p.package_note && (
                        <span className="block truncate text-sm text-muted">{p.package_note}</span>
                      )}
                      <span className="block text-xs text-muted">
                        Actualizado {relativeDate(p.updated_at)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-semibold text-primary-ink">
                        {money(p.price)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <PriceHistory productId={product.id} />

      <ProductFormSheet
        open={editingProduct}
        onClose={() => setEditingProduct(false)}
        householdId={household.id}
        product={product}
      />
      <PriceEditorSheet
        open={addingPrice}
        onClose={() => setAddingPrice(false)}
        householdId={household.id}
        productId={product.id}
        unit={product.unit}
        usedStoreIds={usedStoreIds}
      />
      <PriceEditorSheet
        open={editingPrice !== null}
        onClose={() => setEditingPrice(null)}
        householdId={household.id}
        productId={product.id}
        unit={product.unit}
        price={editingPrice}
      />
    </>
  )
}
