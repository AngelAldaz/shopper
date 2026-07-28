import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/cn'
import { formatQuantity, type Unit } from '@/lib/money'

interface Props {
  open: boolean
  onClose: () => void
  productName: string
  unit: Unit
  /** Cantidad inicial (unidad base): al editar un renglón existente. */
  initial?: number
  onConfirm: (quantity: number) => void
}

// Atajos por unidad. En kg y L la cantidad se guarda en la unidad grande, así
// que 500 g = 0.5. Es la regla del gramaje que pediste: apuntas el precio por
// kilo y aquí eliges cuánto vas a comprar.
const SHORTCUTS: Record<Exclude<Unit, 'pieza'>, { label: string; value: number }[]> = {
  kg: [
    { label: '250 g', value: 0.25 },
    { label: '500 g', value: 0.5 },
    { label: '750 g', value: 0.75 },
    { label: '1 kg', value: 1 },
    { label: '2 kg', value: 2 },
  ],
  l: [
    { label: '250 ml', value: 0.25 },
    { label: '500 ml', value: 0.5 },
    { label: '1 L', value: 1 },
    { label: '2 L', value: 2 },
  ],
}

export function QuantitySheet({ open, onClose, productName, unit, initial, onConfirm }: Props) {
  const [qty, setQty] = useState(1)
  const [freeText, setFreeText] = useState('')

  useEffect(() => {
    if (!open) return
    setQty(initial ?? (unit === 'pieza' ? 1 : 0.5))
    setFreeText('')
  }, [open, initial, unit])

  function confirm(value: number) {
    if (value > 0) onConfirm(Math.round(value * 1000) / 1000)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={productName}
      footer={
        <Button size="lg" block onClick={() => confirm(qty)} disabled={qty <= 0}>
          Agregar · {formatQuantity(qty, unit)}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {unit === 'pieza' ? (
          <div className="flex items-center justify-center gap-5 py-4">
            <button
              type="button"
              aria-label="Menos"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid size-14 place-items-center rounded-full bg-surface-2 text-primary-ink active:scale-90"
            >
              <Minus size={24} />
            </button>
            <span className="w-16 text-center text-4xl font-semibold tabular-nums">{qty}</span>
            <button
              type="button"
              aria-label="Más"
              onClick={() => setQty((q) => q + 1)}
              className="grid size-14 place-items-center rounded-full bg-primary text-on-primary active:scale-90"
            >
              <Plus size={24} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {SHORTCUTS[unit].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setQty(s.value)
                    setFreeText('')
                  }}
                  className={cn(
                    'h-12 min-w-[4.5rem] rounded-full border px-4 text-base font-semibold',
                    qty === s.value && !freeText
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-border bg-surface text-text',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="px-1 text-sm font-semibold text-muted">
                O escribe la cantidad ({unit === 'kg' ? 'kg' : 'L'})
              </span>
              <input
                inputMode="decimal"
                value={freeText}
                onChange={(e) => {
                  setFreeText(e.target.value)
                  const n = Number.parseFloat(e.target.value.replace(',', '.'))
                  if (Number.isFinite(n) && n > 0) setQty(n)
                }}
                placeholder={unit === 'kg' ? '1.5' : '1.5'}
                className="h-12 rounded-soft border border-border bg-surface px-4 text-center text-lg outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </>
        )}
      </div>
    </Sheet>
  )
}
