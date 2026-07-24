import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Plus, Search } from 'lucide-react'
import { rank } from '@/lib/search'
import { cn } from '@/lib/cn'

interface Props<T> {
  items: T[]
  getKey: (item: T) => string
  /** Texto contra el que se busca (nombre + marca, por ejemplo). */
  getText: (item: T) => string
  getLastUsedAt?: (item: T) => number | null | undefined
  renderItem: (item: T, query: string) => ReactNode
  onSelect: (item: T) => void
  /** Si se pasa, siempre aparece "+ Crear …" al final de los resultados. */
  onCreate?: (query: string) => void
  createLabel?: (query: string) => string
  placeholder?: string
  autoFocus?: boolean
  limit?: number
  className?: string
}

/**
 * Buscador con filtrado progresivo, reutilizado en los cuatro sitios donde hay
 * que elegir algo: agregar a una lista, crear un producto, elegir súper al
 * poner un precio y el buscador del catálogo.
 *
 * Dos reglas que vienen de cómo pidió el usuario que se comportara:
 * 1. Muestra opciones desde la primera letra y se van reduciendo al escribir.
 * 2. **Nunca** bloquea con "eso ya existe": enseña las coincidencias y deja
 *    "+ Crear …" siempre disponible para que decida la persona.
 */
export function Typeahead<T>({
  items,
  getKey,
  getText,
  getLastUsedAt,
  renderItem,
  onSelect,
  onCreate,
  createLabel = (q) => `Crear "${q}"`,
  placeholder = 'Buscar…',
  autoFocus = false,
  limit = 30,
  className,
}: Props<T>) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(
    () => rank(items, query, { getText, getLastUsedAt, limit }),
    [items, query, getText, getLastUsedAt, limit],
  )

  const canCreate = Boolean(onCreate) && query.trim().length > 0
  const total = results.length + (canCreate ? 1 : 0)

  // Al cambiar la consulta el resaltado vuelve al primero; si no, quedaría
  // apuntando a un índice de la lista anterior.
  useEffect(() => setCursor(0), [query])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  function choose(index: number) {
    if (index < results.length) {
      const item = results[index]
      if (item !== undefined) onSelect(item)
    } else if (canCreate) {
      onCreate?.(query.trim())
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (total === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (c + 1) % total)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (c - 1 + total) % total)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(cursor)
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 focus-within:ring-2 focus-within:ring-primary/40">
        <Search size={20} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          // Sin esto iOS pone mayúscula y autocorrige nombres de producto.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-12 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/60 [&::-webkit-search-cancel-button]:hidden"
        />
      </div>

      <ul className="flex flex-col gap-1.5">
        {results.map((item, i) => (
          <li key={getKey(item)}>
            <button
              type="button"
              onClick={() => choose(i)}
              className={cn(
                'flex w-full items-center gap-3 rounded-soft px-3 py-2.5 text-left',
                'min-h-14 active:bg-primary-soft',
                i === cursor && 'bg-surface-2',
              )}
            >
              {renderItem(item, query)}
            </button>
          </li>
        ))}

        {canCreate && (
          <li>
            <button
              type="button"
              onClick={() => choose(results.length)}
              className={cn(
                'flex min-h-14 w-full items-center gap-3 rounded-soft px-3 py-2.5 text-left',
                'font-semibold text-primary-ink active:bg-primary-soft',
                cursor === results.length && 'bg-surface-2',
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-ink">
                <Plus size={20} />
              </span>
              <span className="truncate">{createLabel(query.trim())}</span>
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
