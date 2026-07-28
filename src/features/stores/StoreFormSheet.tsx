import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { saveRow, softDelete } from '@/db/mutate'
import { STORE_COLORS } from '@/features/household/stores-preset'
import { cn } from '@/lib/cn'
import type { Store } from '@/db/schema'

interface Props {
  open: boolean
  onClose: () => void
  householdId: string
  /** Si viene, se edita; si no, se crea. */
  store?: Store | null
}

export function StoreFormSheet({ open, onClose, householdId, store }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(STORE_COLORS[0])
  const [busy, setBusy] = useState(false)

  // Al abrir, se cargan los valores del súper que se edita (o los de un nuevo).
  useEffect(() => {
    if (!open) return
    setName(store?.name ?? '')
    setColor(store?.color ?? STORE_COLORS[0])
  }, [open, store])

  async function save() {
    const clean = name.trim()
    if (!clean) return
    setBusy(true)
    try {
      await saveRow('stores', {
        id: store?.id,
        household_id: householdId,
        name: clean,
        color,
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!store) return
    if (
      !confirm(
        `¿Borrar ${store.name}? Se quitarán también los precios que tengas guardados en este súper. Los productos y los demás supers no se tocan.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await softDelete('stores', store.id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={store ? 'Editar súper' : 'Nuevo súper'}
      footer={
        <Button size="lg" block onClick={save} disabled={busy || !name.trim()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Walmart"
          maxLength={40}
          autoFocus={!store}
        />

        <div>
          <p className="mb-2 px-1 text-sm font-semibold text-muted">Color</p>
          <div className="flex flex-wrap gap-2.5">
            {STORE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={cn(
                  'size-11 rounded-full transition-transform active:scale-90',
                  color === c && 'ring-2 ring-text ring-offset-2 ring-offset-surface',
                )}
              />
            ))}
          </div>
        </div>

        {store && (
          <Button
            variant="ghost"
            icon={<Trash2 size={17} />}
            onClick={remove}
            disabled={busy}
            className="self-start text-danger"
          >
            Borrar súper
          </Button>
        )}
      </div>
    </Sheet>
  )
}
