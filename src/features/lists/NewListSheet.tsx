import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { Chip } from '@/components/ui/Chip'
import { saveRow } from '@/db/mutate'
import { longDate } from '@/lib/dates'

interface Props {
  open: boolean
  onClose: () => void
  householdId: string
  onCreated: (listId: string) => void
}

export function NewListSheet({ open, onClose, householdId, onCreated }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  // Sugerencias para no empezar en blanco; la de la fecha es la más común.
  const suggestions = ['Despensa', `Súper ${longDate()}`, 'Fin de semana']

  useEffect(() => {
    if (open) setName('')
  }, [open])

  async function create() {
    const clean = name.trim() || 'Despensa'
    setBusy(true)
    try {
      const id = await saveRow('shopping_lists', {
        household_id: householdId,
        name: clean,
        status: 'activa',
      })
      onCreated(id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nueva lista"
      footer={
        <Button size="lg" block onClick={create} disabled={busy}>
          {busy ? 'Creando…' : 'Crear lista'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Despensa"
          maxLength={50}
          autoFocus
        />
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Chip key={s} selected={name === s} onClick={() => setName(s)}>
              {s}
            </Chip>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
