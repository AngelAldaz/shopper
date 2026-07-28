import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { Chip } from '@/components/ui/Chip'
import { StorePicker } from '@/features/stores/StorePicker'
import { PhotoInput } from './PhotoInput'
import { saveRow } from '@/db/mutate'
import { queuePhoto } from '@/db/photos'
import { parsePrice } from '@/lib/parsePrice'
import { perUnitLabel, type Unit } from '@/lib/money'

interface Props {
  open: boolean
  onClose: () => void
  householdId: string
  /** Nombre precargado desde el typeahead ("Crear huevo"). */
  initialName?: string
  /** Al crear, devuelve el id del producto por si se quiere navegar a él. */
  onCreated?: (productId: string) => void
}

const UNITS: { value: Unit; label: string }[] = [
  { value: 'pieza', label: 'Por pieza' },
  { value: 'kg', label: 'Por kilo' },
  { value: 'l', label: 'Por litro' },
]

/**
 * Captura un producto nuevo con su primera foto y su primer precio, en un solo
 * paso. Es el flujo que decide si la app se usa: tiene que ser un sheet corto,
 * sin fricción, y funcionar sin señal.
 */
export function QuickAddSheet({ open, onClose, householdId, initialName, onCreated }: Props) {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [unit, setUnit] = useState<Unit>('pieza')
  const [storeId, setStoreId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initialName ?? '')
    setBrand('')
    setUnit('pieza')
    setStoreId(null)
    setAmount('')
    setPhotoBlob(null)
  }, [open, initialName])

  const parsed = parsePrice(amount)
  // El precio es opcional: se puede dar de alta un producto sin precio y
  // ponérselo después. Pero si hay precio, tiene que haber súper.
  const priceOk = amount.trim() === '' || (parsed !== null && storeId !== null)
  const canSave = name.trim().length > 0 && priceOk

  async function save() {
    const clean = name.trim()
    if (!clean) return
    setBusy(true)
    try {
      const productId = crypto.randomUUID()

      let productPhoto: string | null = null
      // Si hay precio, la foto es de ESE súper. Si no, es la genérica del
      // producto, que sirve de respaldo hasta que haya una por súper.
      const attachToPrice = photoBlob && parsed !== null && storeId

      if (photoBlob && !attachToPrice) {
        productPhoto = await queuePhoto(photoBlob, { entity: 'products', id: productId })
      }

      await saveRow('products', {
        id: productId,
        household_id: householdId,
        name: clean,
        brand: brand.trim() || null,
        unit,
        photo_path: productPhoto,
        last_used_at: new Date().toISOString(),
      })

      if (parsed !== null && storeId) {
        const priceId = crypto.randomUUID()
        let pricePhoto: string | null = null
        if (attachToPrice && photoBlob) {
          pricePhoto = await queuePhoto(photoBlob, { entity: 'product_prices', id: priceId })
        }
        await saveRow('product_prices', {
          id: priceId,
          household_id: householdId,
          product_id: productId,
          store_id: storeId,
          price: parsed,
          photo_path: pricePhoto,
        })
      }

      onCreated?.(productId)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo producto"
      footer={
        <Button size="lg" block onClick={save} disabled={busy || !canSave}>
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <PhotoInput onPhoto={setPhotoBlob} className="mx-auto w-40" />

        <Field
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Huevo blanco"
          autoCapitalize="sentences"
          maxLength={60}
          autoFocus={!initialName}
        />

        <Field
          label="Marca (opcional)"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="San Juan"
          maxLength={40}
        />

        <div>
          <p className="mb-2 px-1 text-sm font-semibold text-muted">¿Cómo se vende?</p>
          <div className="flex flex-wrap gap-2">
            {UNITS.map((u) => (
              <Chip key={u.value} selected={unit === u.value} onClick={() => setUnit(u.value)}>
                {u.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="rounded-card bg-surface-2 p-4">
          <p className="mb-2 text-sm font-semibold text-muted">Primer precio (opcional)</p>
          <div className="flex flex-col gap-3">
            <StorePicker householdId={householdId} value={storeId} onChange={setStoreId} />
            <Field
              label={`Precio ${perUnitLabel(unit)}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              leading="$"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>
    </Sheet>
  )
}
