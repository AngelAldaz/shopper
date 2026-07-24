import { useState } from 'react'
import { Moon, Smartphone, Sun } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { applyTheme, getThemePref, type ThemePref } from '@/lib/theme'

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Automático', Icon: Smartphone },
]

export function MePage() {
  const [pref, setPref] = useState<ThemePref>(getThemePref)

  function choose(next: ThemePref) {
    setPref(next)
    applyTheme(next)
  }

  return (
    <>
      <PageHeader title="Yo" />

      <div className="flex flex-col gap-4 px-5">
        <Card className="p-4">
          <h2 className="mb-3 text-lg font-semibold">Tema</h2>
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map(({ value, label, Icon }) => (
              <Chip key={value} selected={pref === value} onClick={() => choose(value)}>
                <Icon size={16} />
                {label}
              </Chip>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-1 text-lg font-semibold">Instalar en el iPhone</h2>
          <p className="text-sm text-muted">
            Abre esta página en Safari, toca el botón Compartir y elige{' '}
            <strong className="text-text">Agregar a inicio</strong>. Así se abre sin la barra
            del navegador y funciona sin señal dentro del súper.
          </p>
        </Card>
      </div>
    </>
  )
}
