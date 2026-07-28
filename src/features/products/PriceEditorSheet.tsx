import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { StorePicker } from '@/features/stores/StorePicker'
import { PhotoInput } from './PhotoInput'
import { saveRow, softDelete } from '@/db/mutate'
import { queuePhoto, resolvePhotoUrl } from '@/db/photos'
import { parsePrice } from '@/lib/parsePrice'
import { perUnitLabel, type Unit } from '@/lib/money'
import type { ProductPrice } from '@/db/schema'

interface Props {
  open: boolean
  onClose: () => void
  householdId: string
  productId: string
  unit: Unit
  /** Si viene, se edita ese precio; si no, se agrega en otro súper. */
  price?: ProductPrice | null
  /** Supers que ya tienen precio, para no ofrecerlos al agregar uno nuevo. */
  usedStoreIds?: string[]
}

/**
 * Alta y edición del precio de un producto en UN súper concreto.
 *
 * Es el gesto que el usuario describió: estás en el pasillo, ves otra marca más
 * barata, corriges el precio y cambias la foto. Todo se guarda al instante en
 * local aunque no haya señal.
 */
export function PriceEditorSheet({
  open,
  onClose,
  householdId,
  productId,
  unit,
  price,
  usedStoreIds = [],
}: Props) {
  const [storeId, setStoreId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setStoreId(price?.store_id ?? null)
    setAmount(price ? String(price.price) : '')
    setNote(price?.package_note ?? '')
    setPhotoBlob(null)
    void resolvePhotoUrl(price?.photo_path).then(setCurrentUrl)
  }, [open, price])

  const parsed = parsePrice(amount)
  const canSave = storeId !== null && parsed !== null

  async function save() {
    if (!storeId || parsed === null) return
    setBusy(true)
    try {
      // El id del precio se decide ANTES de guardar la foto, porque la foto
      // necesita saber a qué fila pertenece para reescribir su ruta al subir.
      const priceId = price?.id ?? crypto.randomUUID()

      let photoPath = price?.photo_path ?? null
      if (photoBlob) {
        photoPath = await queuePhoto(photoBlob, { entity: 'product_prices', id: priceId })
      }

      await saveRow('product_prices', {
        id: priceId,
        household_id: householdId,
        product_id: productId,
        store_id: storeId,
        price: parsed,
        package_note: note.trim() || null,
        photo_path: photoPath,
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!price) return
    if (!confirm('¿Quitar el precio de este súper? Los demás supers no se tocan.')) return
    setBusy(true)
    try {
      await softDelete('product_prices', price.id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={price ? 'Editar precio' : 'Agregar en otro súper'}
      footer={
        <Button size="lg" block onClick={save} disabled={busy || !canSave}>
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <PhotoInput
          currentUrl={currentUrl}
          onPhoto={setPhotoBlob}
          className="mx-auto w-40"
        />

        <div>
          <p className="mb-1.5 px-1 text-sm font-semibold text-muted">Súper</p>
          <StorePicker
            householdId={householdId}
            value={storeId}
            onChange={setStoreId}
          />
          {/* Al agregar un precio nuevo, avisa si ese súper ya lo tenía: sería
              un duplicado que el índice único rechazaría. */}
          {!price && storeId && usedStoreIds.includes(storeId) && (
            <p className="mt-1 px-1 text-sm text-warning">
              Este producto ya tiene un precio en ese súper. Si guardas, lo reemplazas.
            </p>
          )}
        </div>

        <Field
          label={`Precio (${perUnitLabel(unit)})`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          leading="$"
          placeholder="0.00"
          autoFocus={!price}
        />

        <Field
          label="Nota (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="18 piezas · caja grande…"
          maxLength={60}
        />

        {price && (
          <Button
            variant="ghost"
            icon={<Trash2 size={17} />}
            onClick={remove}
            disabled={busy}
            className="self-start text-danger"
          >
            Quitar de este súper
          </Button>
        )}
      </div>
    </Sheet>
  )
}
