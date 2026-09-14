import { applyMigrations } from './migrations'
import { DB_NAME, DB_VERSION, type StoreName } from './schema'

/**
 * The only module that touches raw IndexedDB APIs. Everything above it works
 * with promises and plain domain objects.
 *
 * The connection is cached, but browsers may close it after long idle / tab
 * suspension. Lifecycle handlers + a single InvalidStateError retry keep
 * reads and writes working without a full page reload.
 */

export class DatabaseError extends Error {
  override name = 'DatabaseError'
}

let connection: Promise<IDBDatabase> | null = null

function clearConnectionIfCurrent(candidate: Promise<IDBDatabase>): void {
  if (connection === candidate) {
    connection = null
  }
}

function attachConnectionLifecycle(db: IDBDatabase, ownedBy: Promise<IDBDatabase>): void {
  const forget = () => clearConnectionIfCurrent(ownedBy)

  db.onversionchange = () => {
    forget()
    try {
      db.close()
    } catch {
      // Already closing or closed.
    }
  }

  // Fired for unexpected closes (idle eviction, storage pressure, etc.).
  // Not fired when we call db.close() ourselves.
  db.onclose = () => {
    forget()
  }
}

export function openDatabase(): Promise<IDBDatabase> {
  if (connection) {
    return connection
  }

  let owned!: Promise<IDBDatabase>

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new DatabaseError('IndexedDB is not available in this environment'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      applyMigrations(request.result, event.oldVersion)
    }
    request.onsuccess = () => {
      const db = request.result
      attachConnectionLifecycle(db, owned)
      resolve(db)
    }
    request.onerror = () => reject(toDatabaseError(request.error, `Failed to open ${DB_NAME}`))
    request.onblocked = () =>
      reject(new DatabaseError(`${DB_NAME} upgrade is blocked by another open tab`))
  })

  owned = pending.catch((error: unknown) => {
    clearConnectionIfCurrent(owned)
    throw error
  })
  connection = owned
  return owned
}

export function closeDatabase(): void {
  const pending = connection
  connection = null
  void pending
    ?.then((db) => {
      db.onversionchange = null
      db.onclose = null
      db.close()
    })
    .catch(() => undefined)
}

/** Test helper: drops the whole database so a verification run starts clean. */
export function deleteDatabase(): Promise<void> {
  closeDatabase()
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(toDatabaseError(request.error, `Failed to delete ${DB_NAME}`))
    request.onblocked = () =>
      reject(new DatabaseError(`${DB_NAME} deletion is blocked by another open tab`))
  })
}

export interface StoreAccessor<T> {
  get(key: string): Promise<T | undefined>
  getAll(): Promise<T[]>
  getAllByIndex(indexName: string, value: IDBValidKey): Promise<T[]>
  add(value: T): Promise<void>
  put(value: T): Promise<void>
  delete(key: string): Promise<void>
  count(): Promise<number>
}

export interface TransactionContext {
  store<T>(name: StoreName): StoreAccessor<T>
}

/**
 * Runs `work` inside a single IndexedDB transaction. `work` may only await
 * promises produced by the accessors it is given — awaiting anything else lets
 * the transaction auto-commit before the work finishes.
 *
 * If the cached connection was closed underneath us, reopen once and retry.
 * A transaction started on a closing connection never commits, so retrying is safe.
 */
export async function runTransaction<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  work: (ctx: TransactionContext) => T | Promise<T>,
): Promise<T> {
  try {
    return await runTransactionOnce(stores, mode, work)
  } catch (error) {
    if (!isClosedConnectionError(error)) {
      throw error
    }
    connection = null
    return runTransactionOnce(stores, mode, work)
  }
}

async function runTransactionOnce<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  work: (ctx: TransactionContext) => T | Promise<T>,
): Promise<T> {
  const db = await openDatabase()
  const names = Array.isArray(stores) ? stores : [stores]

  let tx: IDBTransaction
  try {
    tx = db.transaction(names, mode)
  } catch (error) {
    if (isClosedConnectionError(error)) {
      connection = null
    }
    throw error
  }

  const completion = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(toDatabaseError(tx.error, 'Transaction failed'))
    tx.onabort = () => reject(toDatabaseError(tx.error, 'Transaction aborted'))
  })

  let result: T
  try {
    result = await work(createContext(tx))
  } catch (error) {
    abortQuietly(tx)
    completion.catch(() => undefined)
    throw error
  }

  await completion
  return result
}

function createContext(tx: IDBTransaction): TransactionContext {
  return {
    store<T>(name: StoreName): StoreAccessor<T> {
      const store = tx.objectStore(name)
      return {
        get: (key) => toPromise<T | undefined>(store.get(key)),
        getAll: () => toPromise<T[]>(store.getAll()),
        getAllByIndex: (indexName, value) =>
          toPromise<T[]>(store.index(indexName).getAll(IDBKeyRange.only(value))),
        add: (value) => toVoidPromise(store.add(value)),
        put: (value) => toVoidPromise(store.put(value)),
        delete: (key) => toVoidPromise(store.delete(key)),
        count: () => toPromise<number>(store.count()),
      }
    },
  }
}

function toPromise<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(toDatabaseError(request.error, 'IndexedDB request failed'))
  })
}

function toVoidPromise(request: IDBRequest): Promise<void> {
  return toPromise<unknown>(request).then(() => undefined)
}

function abortQuietly(tx: IDBTransaction): void {
  try {
    tx.abort()
  } catch {
    // Already committed or aborted; the original error is what matters.
  }
}

function toDatabaseError(cause: DOMException | null, fallback: string): DatabaseError {
  return new DatabaseError(cause ? `${fallback}: ${cause.message}` : fallback)
}

/** True when the browser closed (or is closing) the IndexedDB connection. */
function isClosedConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const name = 'name' in error ? String((error as { name: unknown }).name) : ''
  const message = 'message' in error ? String((error as { message: unknown }).message) : ''

  if (name === 'InvalidStateError') return true
  if (/connection is clos/i.test(message)) return true
  if (/Indexed Database server lost/i.test(message)) return true
  return false
}
