import { describe, expect, it } from 'vitest'
import { resolveSupabaseConfig } from './supabaseConfig'

describe('resolveSupabaseConfig', () => {
  it('usa las llaves cuando están', () => {
    const c = resolveSupabaseConfig('https://abc.supabase.co', 'llave123')
    expect(c).toEqual({ url: 'https://abc.supabase.co', anonKey: 'llave123', configured: true })
  })

  /**
   * Este es el caso que rompió el despliegue de verdad y por el que existe
   * este archivo. Vite sustituye import.meta.env en compilación: si la variable
   * no está definida en el CI, en el bundle queda "" y NO undefined. Con `??`
   * la cadena vacía pasaba de largo, createClient('') lanzaba al cargar el
   * módulo y la app quedaba en blanco, sin ningún mensaje que dijera qué
   * faltaba.
   */
  it('trata la cadena vacía como "sin configurar", no como valor válido', () => {
    const c = resolveSupabaseConfig('', '')
    expect(c.configured).toBe(false)
    expect(c.url).not.toBe('')
    expect(c.anonKey).not.toBe('')
  })

  it('tampoco se deja engañar por espacios en blanco', () => {
    expect(resolveSupabaseConfig('   ', '  ').configured).toBe(false)
  })

  it('exige las dos: con una sola no está configurado', () => {
    expect(resolveSupabaseConfig('https://abc.supabase.co', '').configured).toBe(false)
    expect(resolveSupabaseConfig('', 'llave123').configured).toBe(false)
  })

  it('tolera undefined', () => {
    const c = resolveSupabaseConfig(undefined, undefined)
    expect(c.configured).toBe(false)
    expect(c.url).toMatch(/^https?:\/\//)
  })

  it('recorta los espacios de una llave pegada del portapapeles', () => {
    const c = resolveSupabaseConfig(' https://abc.supabase.co ', ' llave123 ')
    expect(c).toMatchObject({ url: 'https://abc.supabase.co', anonKey: 'llave123' })
  })
})
