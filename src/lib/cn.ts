import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Une clases resolviendo conflictos de Tailwind.
 *
 * Sin `twMerge`, un `<Button className="px-6">` no ganaría de forma predecible
 * sobre el `px-4` interno del componente: en el CSS generado no manda el orden
 * en que las escribiste, sino el orden interno de Tailwind.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
