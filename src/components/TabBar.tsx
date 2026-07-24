import { NavLink } from 'react-router'
import { ListChecks, ShoppingBasket, Store, Heart } from 'lucide-react'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/', label: 'Listas', Icon: ListChecks, end: true },
  { to: '/catalogo', label: 'Catálogo', Icon: ShoppingBasket, end: false },
  { to: '/supers', label: 'Supers', Icon: Store, end: false },
  { to: '/yo', label: 'Yo', Icon: Heart, end: false },
] as const

export function TabBar() {
  return (
    <nav
      aria-label="Secciones"
      className={cn(
        'safe-bottom fixed inset-x-0 bottom-0 z-30',
        'border-t border-border bg-surface/95 backdrop-blur-lg',
      )}
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  // h-14 mantiene cada destino muy por encima de los 44 pt de Apple.
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold',
                  isActive ? 'text-primary' : 'text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
