import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { saveRow, softDelete } from '@/db/mutate'
import type { Unit } from '@/lib/money'
import type { Product } from '@/db/schema'

interface Props {
  open: boolean
  onClose: () => void
  householdId: string
  product: Product
}

const UNITS: { value: Unit; label: string }[] = [
  { value: 'pieza', label: 'Por pieza' },
  { value: 'kg', label: 'Por kilo' },
  { value: 'l', label: 'Por litro' },
]

/** Edita nombre, marca y unidad de un producto ya existente. */
export function ProductFormSheet({ open, onClose, householdId, product }: Props) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [unit, setUnit] = useState<Unit>('pieza')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(product.name)
    setBrand(product.brand ?? '')
    setUnit(product.unit)
  }, [open, product])

  async function save() {
    const clean = name.trim()
    if (!clean) return
    setBusy(true)
    try {
      await saveRow('products', {
        id: product.id,
        household_id: householdId,
        name: clean,
        brand: brand.trim() || null,
        unit,
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (
      !confirm(
        `¿Borrar ${product.name}? Se quitará de todos los supers y de las listas donde esté. No se puede deshacer.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await softDelete('products', product.id)
      onClose()
      navigate('/catalogo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Editar producto"
      footer={
        <Button size="lg" block onClick={save} disabled={busy || !name.trim()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <Field
          label="Marca (opcional)"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
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
        <Button
          variant="ghost"
          icon={<Trash2 size={17} />}
          onClick={remove}
          disabled={busy}
          className="self-start text-danger"
        >
          Borrar producto
        </Button>
      </div>
    </Sheet>
  )
}
