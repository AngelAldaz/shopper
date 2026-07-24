import { useState } from 'react'
import { LogOut, Moon, Smartphone, Sun } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { applyTheme, getThemePref, type ThemePref } from '@/lib/theme'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/features/auth/SessionProvider'
import { HouseholdSection } from '@/features/household/HouseholdSection'

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Automático', Icon: Smartphone },
]

export function MePage() {
  const { session } = useSession()
  const [pref, setPref] = useState<ThemePref>(getThemePref)

  function choose(next: ThemePref) {
    setPref(next)
    applyTheme(next)
  }

  const name = session?.user.user_metadata?.['display_name'] as string | undefined

  return (
    <>
      <PageHeader title={name || 'Yo'} subtitle={session?.user.email ?? undefined} />

      <div className="flex flex-col gap-4 px-5">
        <HouseholdSection />

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

        <Button
          variant="ghost"
          block
          icon={<LogOut size={17} />}
          onClick={() => supabase.auth.signOut()}
        >
          Cerrar sesión
        </Button>
      </div>
    </>
  )
}
