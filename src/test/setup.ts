// jsdom no trae IndexedDB, y el motor local-first (Dexie) es justo lo que más
// hay que probar. `fake-indexeddb/auto` instala una implementación completa en
// memoria sobre los globales, así que los tests usan el mismo código que el
// navegador sin mocks a medias.
import 'fake-indexeddb/auto'
