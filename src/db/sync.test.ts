import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './dexie'
import { countFailed, countPending, enqueue, pendingOps } from './outbox'
import { syncPull, syncPush } from './sync'
import type { SyncBackend, SyncError } from './backend'

/**
 * Doble del servidor.
 *
 * Los casos que de verdad hunden una app local-first —que un cambio inválido
 * atore la cola, que un reintento duplique datos, que la ventana de solape
 * pierda una fila— no se pueden provocar de forma fiable contra un servidor
 * real. Aquí sí.
 */
class FakeBackend implements SyncBackend {
  /** Todo lo que se intentó subir, en orden. */
  recibido: { entity: string; payload: Record<string, unknown> }[] = []
  /** Estado del "servidor", por tabla e id. */
  tablas: Record<string, Map<string, Record<string, unknown>>> = {}
  /** Error a devolver en los próximos N upserts, sin llegar a escribir. */
  fallo: { error: SyncError; veces: number } | null = null
  /**
   * Escribe pero devuelve error en los próximos N upserts: simula la respuesta
   * perdida por la red, que es el caso que hace falta para probar idempotencia.
   */
  perderRespuestas = 0
  errorAlBajar: SyncError | null = null

  async upsert(entity: string, payload: Record<string, unknown>) {
    if (this.fallo && this.fallo.veces > 0) {
      this.fallo.veces--
      return { error: this.fallo.error }
    }

    this.recibido.push({ entity, payload })
    this.tablas[entity] ??= new Map()
    this.tablas[entity].set(payload['id'] as string, { ...payload })

    if (this.perderRespuestas > 0) {
      this.perderRespuestas--
      return { error: { message: 'Failed to fetch' } }
    }
    return { error: null }
  }

  async fetchSince(entity: string, cursorColumn: string, sinceIso: string) {
    if (this.errorAlBajar) return { rows: [], error: this.errorAlBajar }
    const todas = [...(this.tablas[entity]?.values() ?? [])]
    return {
      rows: todas.filter((r) => String(r[cursorColumn] ?? '') > sinceIso),
      error: null,
    }
  }

  async fetchAll(entity: string) {
    if (this.errorAlBajar) return { rows: [], error: this.errorAlBajar }
    return { rows: [...(this.tablas[entity]?.values() ?? [])], error: null }
  }

  sembrar(entity: string, filas: Record<string, unknown>[]) {
    this.tablas[entity] ??= new Map()
    for (const f of filas) this.tablas[entity].set(String(f['id']), f)
  }
}

const HOGAR = '00000000-0000-4000-8000-000000000001'

function producto(id: string, name: string, updated_at = '2026-07-24T10:00:00.000Z') {
  return {
    id,
    household_id: HOGAR,
    name,
    brand: null,
    unit: 'pieza',
    photo_path: null,
    notes: null,
    last_used_at: null,
    created_at: updated_at,
    updated_at,
    deleted_at: null,
    created_by: null,
    updated_by: null,
  }
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  await Promise.all(db.tables.map((t) => t.clear()))
})

// ─────────────────────────────────────────────────────────────────────────────
describe('cola de salida', () => {
  it('respeta el orden en que ocurrieron las cosas', async () => {
    // El caso real: creas un producto y enseguida le pones precio. Si el precio
    // se mandara primero, la clave foránea lo rechazaría.
    await enqueue('products', producto('p1', 'Huevo'))
    await enqueue('product_prices', {
      id: 'pp1',
      household_id: HOGAR,
      product_id: 'p1',
      store_id: 's1',
      price: 62,
    })

    const backend = new FakeBackend()
    await syncPush(backend)

    expect(backend.recibido.map((r) => r.entity)).toEqual(['products', 'product_prices'])
  })

  it('agrupa varias ediciones de la misma fila en un solo envío', async () => {
    // Corregir tres veces el precio en el pasillo debe subir un cambio, no tres.
    await enqueue('products', producto('p1', 'Huevo'))
    await enqueue('products', producto('p1', 'Huevo blanco'))
    await enqueue('products', producto('p1', 'Huevo blanco San Juan'))

    expect(await countPending()).toBe(1)

    const backend = new FakeBackend()
    await syncPush(backend)
    expect(backend.recibido).toHaveLength(1)
    expect(backend.recibido[0]?.payload['name']).toBe('Huevo blanco San Juan')
  })

  it('al agrupar conserva el orden original, no lo manda al final', async () => {
    await enqueue('products', producto('p1', 'Huevo'))
    await enqueue('product_prices', { id: 'pp1', household_id: HOGAR, product_id: 'p1', store_id: 's1', price: 62 })
    // Se vuelve a editar el producto DESPUÉS de crear su precio.
    await enqueue('products', producto('p1', 'Huevo blanco'))

    const backend = new FakeBackend()
    await syncPush(backend)

    // El producto sigue yendo primero: si se hubiera reencolado al final, su
    // precio habría llegado antes que él.
    expect(backend.recibido.map((r) => r.entity)).toEqual(['products', 'product_prices'])
    expect(backend.recibido[0]?.payload['name']).toBe('Huevo blanco')
  })

  it('nunca manda columnas generadas por el servidor', async () => {
    // search_key es GENERATED ALWAYS: mandarla hace fallar el insert entero.
    // created_by lo pone un trigger y no debe venir del cliente.
    await enqueue('products', { ...producto('p1', 'Piña'), search_key: 'pina', created_by: 'yo' })

    const backend = new FakeBackend()
    await syncPush(backend)

    const enviado = backend.recibido[0]?.payload ?? {}
    expect(enviado).not.toHaveProperty('search_key')
    expect(enviado).not.toHaveProperty('created_by')
    expect(enviado).not.toHaveProperty('updated_at')
    expect(enviado['name']).toBe('Piña')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('subida', () => {
  it('reintentar tras perder la respuesta no duplica', async () => {
    await enqueue('products', producto('p1', 'Huevo'))
    const backend = new FakeBackend()

    // El servidor SÍ escribe, pero la respuesta se pierde en el camino: para el
    // cliente es indistinguible de un fallo, así que reintentará.
    backend.perderRespuestas = 1
    const primero = await syncPush(backend)
    expect(primero.interrupted).toBe(true)
    expect(await countPending()).toBe(1)

    // Segundo intento, ahora con red.
    await syncPush(backend)

    // Una sola fila: el id lo generó el cliente, así que el upsert por id es
    // idempotente. Con ids del servidor, este reintento habría creado un
    // producto duplicado.
    expect(backend.tablas['products']?.size).toBe(1)
    expect(backend.recibido).toHaveLength(2)
    expect(await countPending()).toBe(0)
  })

  it('un cambio invalido se aparta y NO bloquea a los de atras', async () => {
    await enqueue('products', producto('p1', 'Rechazado'))
    await enqueue('products', producto('p2', 'Bueno'))

    const backend = new FakeBackend()
    backend.fallo = { error: { message: 'RLS', code: '42501' }, veces: 1 }
    const r = await syncPush(backend)

    expect(r.failed).toBe(1)
    expect(r.sent).toBe(1)
    expect(await countFailed()).toBe(1)
    expect(await countPending()).toBe(0)
    // El segundo llegó: sin este comportamiento, una sola fila mala congelaría
    // la sincronización para siempre.
    expect(backend.recibido.map((r) => r.payload['name'])).toEqual(['Bueno'])
  })

  it('un fallo pasajero corta la subida y lo deja pendiente', async () => {
    await enqueue('products', producto('p1', 'Uno'))
    await enqueue('products', producto('p2', 'Dos'))

    const backend = new FakeBackend()
    backend.fallo = { error: { message: 'Failed to fetch' }, veces: 1 }
    const r = await syncPush(backend)

    expect(r.interrupted).toBe(true)
    expect(await countPending()).toBe(2)
    // Se corta a propósito: adelantar el segundo podría mandar un precio antes
    // que el producto al que apunta.
    expect(backend.recibido).toHaveLength(0)
  })

  it('un error DEL SERVIDOR que se repite deja de bloquear tras varios intentos', async () => {
    await enqueue('products', producto('p1', 'Terco'))
    await enqueue('products', producto('p2', 'Bueno'))

    const backend = new FakeBackend()
    // 5xx CON código: el servidor respondió, pero mal. Eso sí cuenta hacia el
    // tope, por si algo está de verdad roto.
    backend.fallo = { error: { message: 'server error', code: '500' }, veces: 99 }
    for (let i = 0; i < 5; i++) await syncPush(backend)

    expect(await countFailed()).toBe(1)
    const restantes = await pendingOps()
    expect(restantes.map((o) => o.row_id)).toEqual(['p2'])
  })

  it('sin señal NUNCA marca un cambio como fallido, por muchos intentos que pase', async () => {
    // El bug reportado: unos minutos de mala señal en el súper marcaban como
    // "no se guardó" algo perfectamente válido. Un error de red no trae código
    // (el fetch ni llegó al servidor), así que no debe contar como fallo.
    await enqueue('products', producto('p1', 'Huevo'))

    const backend = new FakeBackend()
    backend.fallo = { error: { message: 'Failed to fetch' }, veces: 99 }
    for (let i = 0; i < 10; i++) await syncPush(backend)

    expect(await countFailed()).toBe(0)
    expect(await countPending()).toBe(1) // sigue esperando, con calma

    // Y en cuanto vuelve la red, sube.
    backend.fallo = null
    await syncPush(backend)
    expect(await countPending()).toBe(0)
    expect(backend.tablas['products']?.size).toBe(1)
  })

  it('re-editar una fila sana un cambio que había quedado fallido', async () => {
    // Un cambio se marca fallido (RLS temporal, lo que sea). Antes, volver a
    // tocar esa fila creaba una op nueva y dejaba la fallida conviviendo, así
    // que el banner "no se guardó" no se iba nunca.
    await enqueue('products', producto('p1', 'Huevo'))
    const backend = new FakeBackend()
    backend.fallo = { error: { message: 'RLS', code: '42501' }, veces: 1 }
    await syncPush(backend)
    expect(await countFailed()).toBe(1)

    // El usuario corrige el producto: al re-encolarlo, el fallido se sana.
    await enqueue('products', producto('p1', 'Huevo blanco'))
    expect(await countFailed()).toBe(0)
    expect(await countPending()).toBe(1)

    await syncPush(backend)
    expect(await countPending()).toBe(0)
    expect(backend.tablas['products']?.get('p1')?.['name']).toBe('Huevo blanco')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('bajada', () => {
  it('trae lo nuevo al espejo local', async () => {
    const backend = new FakeBackend()
    backend.sembrar('products', [producto('p1', 'Huevo'), producto('p2', 'Leche')])

    await syncPull(backend)
    expect(await db.products.count()).toBe(2)
  })

  it('pide con solape hacia atras para no perder filas por una carrera', async () => {
    const backend = new FakeBackend()
    backend.sembrar('products', [producto('p1', 'Huevo', '2026-07-24T10:00:00.000Z')])
    await syncPull(backend)

    // Otra transacción escribió con una marca 5 s ANTERIOR a la nuestra pero
    // confirmó después: sin solape, esta fila no se pediría jamás.
    backend.sembrar('products', [producto('p2', 'Tardío', '2026-07-24T09:59:55.000Z')])
    await syncPull(backend)

    expect(await db.products.count()).toBe(2)
  })

  it('lo borrado en suave desaparece del espejo', async () => {
    const backend = new FakeBackend()
    backend.sembrar('products', [producto('p1', 'Huevo')])
    await syncPull(backend)
    expect(await db.products.count()).toBe(1)

    backend.sembrar('products', [
      { ...producto('p1', 'Huevo'), deleted_at: '2026-07-24T11:00:00.000Z', updated_at: '2026-07-24T11:00:00.000Z' },
    ])
    await syncPull(backend)

    // Se va del espejo en vez de quedarse marcado, para que ninguna consulta de
    // la app tenga que acordarse de filtrar.
    expect(await db.products.count()).toBe(0)
  })

  it('gana la escritura mas reciente', async () => {
    const backend = new FakeBackend()
    backend.sembrar('products', [producto('p1', 'Huevo', '2026-07-24T10:00:00.000Z')])
    await syncPull(backend)

    backend.sembrar('products', [producto('p1', 'Huevo blanco', '2026-07-24T12:00:00.000Z')])
    await syncPull(backend)

    expect((await db.products.get('p1'))?.name).toBe('Huevo blanco')
  })

  it('si te sacan del hogar, tu membresia desaparece del espejo', async () => {
    const backend = new FakeBackend()
    backend.sembrar('household_members', [
      { id: 'm1', household_id: HOGAR, user_id: 'u1', role: 'owner', joined_at: '2026-07-24T10:00:00.000Z' },
      { id: 'm2', household_id: HOGAR, user_id: 'u2', role: 'member', joined_at: '2026-07-24T10:00:00.000Z' },
    ])
    await syncPull(backend)
    expect(await db.household_members.count()).toBe(2)

    // Salir del hogar es un borrado DURO: la fila simplemente deja de venir.
    backend.tablas['household_members']?.delete('m2')
    await syncPull(backend)

    // Solo se nota porque esta tabla se trae entera y se reemplaza; un delta
    // por fecha no vería nunca esta desaparición.
    expect(await db.household_members.count()).toBe(1)
  })

  it('un fallo al bajar no avanza la marca, para no saltarse nada', async () => {
    const backend = new FakeBackend()
    backend.sembrar('products', [producto('p1', 'Huevo', '2026-07-24T10:00:00.000Z')])
    await syncPull(backend)

    backend.sembrar('products', [producto('p2', 'Leche', '2026-07-24T11:00:00.000Z')])
    backend.errorAlBajar = { message: 'sin red' }
    const r = await syncPull(backend)
    expect(r.error).toBe('sin red')

    backend.errorAlBajar = null
    await syncPull(backend)
    expect(await db.products.count()).toBe(2)
  })
})
