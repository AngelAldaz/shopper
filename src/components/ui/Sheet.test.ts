import { describe, expect, it } from 'vitest'
import { Sheet } from './Sheet'

/**
 * Regresión de un fallo que se vio en el iPhone: la hoja aparecía siempre,
 * tapaba la pantalla y no había forma de cerrarla.
 *
 * La causa era que el <dialog> llevaba la clase `flex`, que pisa la regla del
 * navegador `dialog:not([open]) { display: none }`. Al quedarse visible fuera
 * de la capa superior, la barra de pestañas se dibujaba encima y cerrar no
 * hacía nada: solo quitaba el atributo `open`, y el `display: flex` seguía
 * ganando.
 *
 * La defensa que no depende de acordarse de una clase CSS es no montar nada
 * cuando está cerrada. Eso es lo que se fija aquí.
 *
 * Se puede invocar el componente como función porque el retorno temprano va
 * ANTES de cualquier hook — justo por eso el panel vive en un componente
 * aparte.
 */
describe('Sheet', () => {
  it('no monta absolutamente nada cuando está cerrada', () => {
    expect(Sheet({ open: false, onClose: () => {}, children: 'contenido' })).toBeNull()
  })

  it('sí monta algo cuando está abierta', () => {
    expect(Sheet({ open: true, onClose: () => {}, children: 'contenido' })).not.toBeNull()
  })
})
