import { STORE_DEFINITIONS } from './schema'

/**
 * Runs inside `onupgradeneeded`. Each version step must be additive so an
 * existing database can be upgraded without data loss.
 */
export function applyMigrations(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    createInitialSchema(db)
  }
}

function createInitialSchema(db: IDBDatabase): void {
  for (const definition of STORE_DEFINITIONS) {
    if (db.objectStoreNames.contains(definition.name)) {
      continue
    }

    const store = db.createObjectStore(definition.name, { keyPath: definition.keyPath })
    for (const index of definition.indexes) {
      store.createIndex(index.name, index.keyPath, { unique: index.unique })
    }
  }
}
