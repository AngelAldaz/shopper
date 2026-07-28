import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { money } from '@/lib/money'
import type { StoreHistory } from '@/db/priceHistory'

/**
 * Gráfica de la evolución del precio, una línea por súper con su color.
 *
 * Carga diferida (ver PriceHistory): recharts no debe pesar en el arranque de
 * una app que se abre en el pasillo del súper con señal de súper.
 *
 * Cada serie tiene sus propios puntos en el tiempo, así que se dibuja una
 * <Line> por súper con su propio dataset en lugar de una tabla unificada: los
 * precios de dos supers no se capturan en los mismos momentos.
 */
export default function PriceChart({ history }: { history: StoreHistory[] }) {
  const series = history.filter((h) => h.points.length >= 2)
  if (series.length === 0) return null

  return (
    <div className="h-52 w-full rounded-card border border-border bg-surface p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ top: 6, right: 8, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="recordedAt"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={(t: number) =>
              new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(t)
            }
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
            stroke="var(--color-border)"
          />
          <YAxis
            tickFormatter={(v: number) => `$${v}`}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
            stroke="var(--color-border)"
            width={44}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              color: 'var(--color-text)',
            }}
            labelFormatter={(t) =>
              new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' }).format(Number(t))
            }
            formatter={(value, name) => [money(Number(value)), String(name)]}
          />
          {series.map((h) => (
            <Line
              key={h.storeId}
              data={h.points}
              dataKey="price"
              name={h.storeName}
              stroke={h.storeColor}
              strokeWidth={2.5}
              dot={{ r: 3, fill: h.storeColor }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
