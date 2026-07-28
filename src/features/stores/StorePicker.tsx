import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Chip } from '@/components/ui/Chip'
import { saveRow } from '@/db/mutate'
import { useStores } from '@/db/queries'
import { STORE_COLORS } from '@/features/household/stores-preset'
import { norm } from '@/lib/norm'

interface Props {
  householdId: string
  value: string | null
  onChange: (storeId: string) => void
}

/**
 * Elige un súper entre chips, o crea uno al vuelo tecleando su nombre.
 *
 * Crear aquí mismo importa: estás frente al estante de un súper que no habías
 * registrado y no quieres salir del flujo de captura para darlo de alta.
 */
export function StorePicker({ householdId, value, onChange }: Props) {
  const stores = useStores()
  const [nuevo, setNuevo] = useState('')
  const [busy, setBusy] = useState(false)

  const yaExiste = stores.some((s) => norm(s.name) === norm(nuevo))
  const puedeCrear = nuevo.trim().length > 0 && !yaExiste

  async function crear() {
    setBusy(true)
    try {
      const color = STORE_COLORS[stores.length % STORE_COLORS.length]
      const id = await saveRow('stores', {
        household_id: householdId,
        name: nuevo.trim(),
        color,
      })
      onChange(id)
      setNuevo('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {stores.map((s) => (
          <Chip
            key={s.id}
            tint={s.color}
            selected={value === s.id}
            onClick={() => onChange(s.id)}
          >
            {s.name}
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 focus-within:ring-2 focus-within:ring-primary/40">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && puedeCrear) {
              e.preventDefault()
              void crear()
            }
          }}
          placeholder="…o agrega otro súper"
          autoCapitalize="words"
          autoCorrect="off"
          className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/60"
        />
        {puedeCrear && (
          <button
            type="button"
            onClick={() => void crear()}
            disabled={busy}
            className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-ink"
          >
            <Plus size={16} /> Crear
          </button>
        )}
      </div>
    </div>
  )
}
