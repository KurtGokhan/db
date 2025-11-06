# Actual Code Excerpts from Electric TypeScript Client Tests

All examples are taken directly from: `~/programs/electric/packages/typescript-client/test`

## 1. Vitest Configuration (vitest.config.ts)

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: `test/support/global-setup.ts`,
    setupFiles: [`vitest-localstorage-mock`],
    typecheck: { enabled: true },
    fileParallelism: false,
    coverage: {
      provider: `istanbul`,
      reporter: [`text`, `json`, `html`, `lcov`],
      include: [`**/src/**`],
    },
    reporters: [`default`, `junit`],
    outputFile: `./junit/test-report.junit.xml`,
    environment: `jsdom`,
  },
})
```

**Key insights:**
- `fileParallelism: false` is essential for serial execution with shared database
- Coverage reporters: istanbul with multiple output formats
- junit output for CI/CD integration
- TypeScript type checking enabled

---

## 2. Global Setup (test/support/global-setup.ts)

```typescript
import type { GlobalSetupContext } from 'vitest/node'
import { makePgClient } from './test-helpers'

const url = process.env.ELECTRIC_URL ?? `http://localhost:3000`
const proxyUrl = process.env.ELECTRIC_PROXY_CACHE_URL ?? `http://localhost:3002`

// name of proxy cache container to execute commands against,
// see docker-compose.yml that spins it up for details
const proxyCacheContainerName = `electric_dev-nginx-1`
// path pattern for cache files inside proxy cache to clear
const proxyCachePath = `/var/cache/nginx/*`

// eslint-disable-next-line quotes -- eslint is acting dumb with enforce backtick quotes mode, and is trying to use it here where it's not allowed.
declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string
    proxyCacheBaseUrl: string
    testPgSchema: string
    proxyCacheContainerName: string
    proxyCachePath: string
  }
}

function waitForElectric(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(`Timed out waiting for Electric to be active`),
      10000
    )

    const tryHealth = async () =>
      fetch(`${url}/v1/health`)
        .then(async (res): Promise<void> => {
          if (!res.ok) return tryHealth()
          const { status } = (await res.json()) as { status: string }
          if (status !== `active`) return tryHealth()
          clearTimeout(timeout)
          resolve()
        })
        .catch((err) => {
          clearTimeout(timeout)
          reject(err)
        })

    return tryHealth()
  })
}

/**
 * Global setup for the test suite. Validates that our server is running, and creates and tears down a
 * special schema in Postgres to ensure clean slate between runs.
 */
export default async function ({ provide }: GlobalSetupContext) {
  await waitForElectric(url)

  const client = makePgClient()

  await client.connect()
  await client.query(`CREATE SCHEMA IF NOT EXISTS electric_test`)

  provide(`baseUrl`, url)
  provide(`testPgSchema`, `electric_test`)
  provide(`proxyCacheBaseUrl`, proxyUrl)
  provide(`proxyCacheContainerName`, proxyCacheContainerName)
  provide(`proxyCachePath`, proxyCachePath)

  return async () => {
    await client.query(`DROP SCHEMA electric_test CASCADE`)
    await client.end()
  }
}
```

**Key insights:**
- Health check recursively polls `/v1/health` endpoint
- 10-second timeout for server startup
- Multiple environment variable overrides supported
- Module augmentation for type-safe context injection
- Cleanup function returns from main function

---

## 3. Test Context Fixtures (test/support/test-context.ts)

### Base Database Client Fixture
```typescript
export const testWithDbClient = test.extend<{
  dbClient: Client
  aborter: AbortController
  baseUrl: string
  pgSchema: string
  clearShape: ClearShapeFn
}>({
  dbClient: async ({}, use) => {
    const searchOption = `-csearch_path=${inject(`testPgSchema`)}`
    const client = makePgClient({ options: searchOption })
    await client.connect()
    await use(client)
    await client.end()
  },
  aborter: async ({}, use) => {
    const controller = new AbortController()
    await use(controller)
    controller.abort(`Test complete`)
  },
  baseUrl: async ({}, use) => use(inject(`baseUrl`)),
  pgSchema: async ({}, use) => use(inject(`testPgSchema`)),
  clearShape: async ({}, use) => {
    await use(
      async (
        table: string,
        options: {
          handle?: string
        } = {}
      ) => {
        const baseUrl = inject(`baseUrl`)
        const url = new URL(`${baseUrl}/v1/shape`)
        url.searchParams.set(`table`, table)

        if (options.handle) {
          url.searchParams.set(SHAPE_HANDLE_QUERY_PARAM, options.handle)
        }

        const resp = await fetch(url.toString(), { method: `DELETE` })

        if (!resp.ok) {
          // if we've been passed a shape handle then we should expect this delete call to succeed.
          if (resp.status === 404) {
            // the shape wasn't found, so maybe it wasn't created in the first place
          } else {
            console.error(
              await FetchError.fromResponse(resp, `DELETE ${url.toString()}`)
            )
            throw new Error(
              `Could not delete shape ${table} with ID ${options.handle}`
            )
          }
        }
      }
    )
  },
})
```

### Issues Table Fixture (Extends testWithDbClient)
```typescript
export const testWithIssuesTable = testWithDbClient.extend<{
  issuesTableSql: string
  issuesTableUrl: string
  issuesTableKey: string
  updateIssue: UpdateIssueFn
  deleteIssue: DeleteIssueFn
  insertIssues: InsertIssuesFn
  clearIssuesShape: ClearIssuesShapeFn
  waitForIssues: WaitForIssuesFn
}>({
  issuesTableSql: async ({ dbClient, task }, use) => {
    const tableName = `"issues for ${task.id}_${Math.random().toString(16).replace(`.`, `_`)}"`
    await dbClient.query(`
    DROP TABLE IF EXISTS ${tableName};
    CREATE TABLE ${tableName} (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      priority INTEGER NOT NULL
    );
    COMMENT ON TABLE ${tableName} IS 'Created for ${task.file?.name.replace(/'/g, `\``) ?? `unknown`} - ${task.name.replace(`'`, `\``)}';
  `)
    await use(tableName)
    await dbClient.query(`DROP TABLE ${tableName}`)
  },
  issuesTableUrl: async ({ issuesTableSql, pgSchema, clearShape }, use) => {
    const urlAppropriateTable = pgSchema + `.` + issuesTableSql
    await use(urlAppropriateTable)
    try {
      await clearShape(urlAppropriateTable)
    } catch (_) {
      // ignore - clearShape has its own logging
      // we don't want to interrupt cleanup
    }
  },
  issuesTableKey: ({ issuesTableSql, pgSchema }, use) =>
    use(`"${pgSchema}".${issuesTableSql}`),
  updateIssue: ({ issuesTableSql, dbClient }, use) =>
    use(({ id, title }) =>
      dbClient.query(`UPDATE ${issuesTableSql} SET title = $2 WHERE id = $1`, [
        id,
        title,
      ])
    ),
  deleteIssue: ({ issuesTableSql, dbClient }, use) =>
    use(({ id }) =>
      dbClient.query(`DELETE FROM ${issuesTableSql} WHERE id = $1`, [id])
    ),
  insertIssues: ({ issuesTableSql, dbClient }, use) =>
    use(async (...rows) => {
      const placeholders = rows.map(
        (_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
      )
      const { rows: rows_1 } = await dbClient.query(
        `INSERT INTO ${issuesTableSql} (id, title, priority) VALUES ${placeholders} RETURNING id`,
        rows.flatMap((x) => [x.id ?? uuidv4(), x.title, 10])
      )
      return rows_1.map((x) => x.id)
    }),

  clearIssuesShape: async ({ clearShape, issuesTableUrl }, use) => {
    use((handle?: string) => clearShape(issuesTableUrl, { handle }))
  },

  waitForIssues: ({ issuesTableUrl, baseUrl, aborter }, use) =>
    use(
      ({
        numChangesExpected,
        shapeStreamOptions,
      }: {
        numChangesExpected?: number
        shapeStreamOptions?: Partial<ShapeStreamOptions>
      }) =>
        waitForTransaction({
          baseUrl,
          table: issuesTableUrl,
          shapeStreamOptions,
          numChangesExpected,
          aborter,
        })
    ),
})
```

**Key insights:**
- Tables named with `task.id` + random suffix for uniqueness
- SQL comments include file name and test name for debugging
- Fixtures can depend on parent fixtures
- Helper functions wrap common operations
- Error handling in cleanup doesn't throw

---

## 4. Test Helpers (test/support/test-helpers.ts)

```typescript
import {
  ShapeStream,
  ShapeStreamInterface,
  ShapeStreamOptions,
} from '../../src/client'
import { Client, ClientConfig } from 'pg'
import { Message, Row } from '../../src/types'
import { isChangeMessage } from '../..//src'
import { isUpToDateMessage } from '../../src/helpers'

export function makePgClient(overrides: ClientConfig = {}) {
  return new Client({
    host: `localhost`,
    port: 54321,
    password: `password`,
    user: `postgres`,
    database: `electric`,
    options: `-csearch_path=electric_test`,
    ...overrides,
  })
}

export function forEachMessage<T extends Row<unknown>>(
  stream: ShapeStreamInterface<T>,
  controller: AbortController,
  handler: (
    resolve: () => void,
    message: Message<T>,
    nthDataMessage: number
  ) => Promise<void> | void
) {
  let unsub = () => {}
  return new Promise<void>((resolve, reject) => {
    let messageIdx = 0

    unsub = stream.subscribe(async (messages) => {
      for (const message of messages) {
        try {
          await handler(
            () => {
              controller.abort()
              return resolve()
            },
            message as Message<T>,
            messageIdx
          )
          if (isChangeMessage(message)) messageIdx++
        } catch (e) {
          controller.abort()
          return reject(e)
        }
      }
    }, reject)
  }).finally(unsub)
}

export async function waitForTransaction({
  baseUrl,
  table,
  numChangesExpected,
  shapeStreamOptions,
  aborter,
}: {
  baseUrl: string
  table: string
  numChangesExpected?: number
  shapeStreamOptions?: Partial<ShapeStreamOptions>
  aborter?: AbortController
}): Promise<Pick<ShapeStreamOptions, `offset` | `handle`>> {
  const waitAborter = new AbortController()
  if (aborter?.signal.aborted) waitAborter.abort()
  else aborter?.signal.addEventListener(`abort`, () => waitAborter.abort())
  const issueStream = new ShapeStream({
    ...(shapeStreamOptions ?? {}),
    url: `${baseUrl}/v1/shape`,
    params: {
      ...(shapeStreamOptions?.params ?? {}),
      table,
    },
    signal: waitAborter.signal,
    subscribe: true,
  })

  numChangesExpected ??= 1
  let numChangesSeen = 0
  await forEachMessage(issueStream, waitAborter, (res, msg) => {
    if (isChangeMessage(msg)) {
      numChangesSeen++
    }

    if (numChangesSeen >= numChangesExpected && isUpToDateMessage(msg)) {
      res()
    }
  })
  return {
    offset: issueStream.lastOffset,
    handle: issueStream.shapeHandle,
  }
}
```

---

## 5. Parameterized Tests (test/integration.test.ts)

```typescript
import { describe, expect, inject, vi } from 'vitest'
import { v4 as uuidv4 } from 'uuid'
import { 
  testWithIssuesTable as it,
  testWithMultitypeTable as mit,
} from './support/test-context'

const BASE_URL = inject(`baseUrl`)

const fetchAndSse = [{ liveSse: false }, { liveSse: true }]

it(`sanity check`, async ({ dbClient, issuesTableSql }) => {
  const result = await dbClient.query(`SELECT * FROM ${issuesTableSql}`)

  expect(result.rows).toEqual([])
})

describe(`HTTP Sync`, () => {
  it.for(fetchAndSse)(
    `should work with empty shape/table (liveSSE=$liveSse)`,
    async ({ liveSse }, { issuesTableUrl, aborter }) => {
      // Get initial data
      const shapeData = new Map()
      const issueStream = new ShapeStream({
        url: `${BASE_URL}/v1/shape`,
        params: {
          table: issuesTableUrl,
        },
        subscribe: false,
        signal: aborter.signal,
        liveSse,
      })

      await new Promise<void>((resolve, reject) => {
        issueStream.subscribe((messages) => {
          messages.forEach((message) => {
            if (isChangeMessage(message)) {
              shapeData.set(message.key, message.value)
            }
            if (isUpToDateMessage(message)) {
              aborter.abort()
              return resolve()
            }
          })
        }, reject)
      })
      const values = [...shapeData.values()]

      expect(values).toHaveLength(0)
    }
  )

  it.for(fetchAndSse)(
    `should get initial data (liveSSE=$liveSse)`,
    async ({ liveSse }, { insertIssues, issuesTableUrl, aborter }) => {
      // Add an initial row.
      const uuid = uuidv4()
      await insertIssues({ id: uuid, title: `foo + ${uuid}` })

      // Get initial data
      const shapeData = new Map()
      const issueStream = new ShapeStream({
        url: `${BASE_URL}/v1/shape`,
        params: {
          table: issuesTableUrl,
        },
        signal: aborter.signal,
        liveSse,
      })

      await new Promise<void>((resolve) => {
        issueStream.subscribe((messages) => {
          messages.forEach((message) => {
            if (isChangeMessage(message)) {
              shapeData.set(message.key, message.value)
            }
            if (isUpToDateMessage(message)) {
              aborter.abort()
              return resolve()
            }
          })
        })
      })
      const values = [...shapeData.values()]

      expect(values).toMatchObject([{ title: `foo + ${uuid}` }])
    }
  )

  mit.for(fetchAndSse)(
    `should parse incoming data (liveSSE=$liveSse)`,
    async ({ liveSse }, { dbClient, aborter, tableSql, tableUrl }) => {
      // Create a table with data we want to be parsed
      await dbClient.query(
        `
      INSERT INTO ${tableSql} (txt, i2, i4, i8, f8, b, json, jsonb, ints, ints2, int4s, bools, moods, moods2, complexes, posints, jsons, txts, value, doubles)
      VALUES (
        'test',
        1,
        2147483647,
        9223372036854775807,
        4.5,
        TRUE,
        '{"foo": "bar"}',
        '{"foo": "bar"}',
        '{1,2,3}',
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11
      )
    `,
        [
          [[1, 2, 3], [4, 5, 6]],
          [1, 2, 3],
          [true, false, true],
          [`sad`, `ok`, `happy`],
          [
            [`sad`, `ok`],
            [`ok`, `happy`],
          ],
          [`(1.1, 2.2)`, `(3.3, 4.4)`],
          [5, 9, 2],
          [
            [`foo`, `bar`],
            [`baz`, `qux`],
          ],
          { something: `else` },
          [1.1, 2.2, 3.3],
        ]
      )
    }
  )
})
```

---

## 6. Parameterized Describe Blocks (test/client.test.ts)

```typescript
import { describe, expect, inject } from 'vitest'
import { testWithIssuesTable as it } from './support/test-context'
import { ShapeStream, Shape } from '../src'

const BASE_URL = inject(`baseUrl`)

const fetchAndSse = [{ liveSse: false }, { liveSse: true }]

describe.for(fetchAndSse)(`Shape (liveSSE=$liveSse)`, ({ liveSse }) => {
  it(`should sync an empty shape`, async ({ issuesTableUrl, aborter }) => {
    const start = Date.now()
    const shapeStream = new ShapeStream({
      url: `${BASE_URL}/v1/shape`,
      params: {
        table: issuesTableUrl,
      },
      signal: aborter.signal,
      liveSse,
    })
    const shape = new Shape(shapeStream)

    expect(await shape.value).toEqual(new Map())
    expect(await shape.rows).toEqual([])
    expect(shape.lastSyncedAt()).toBeGreaterThanOrEqual(start)
    expect(shape.lastSyncedAt()).toBeLessThanOrEqual(Date.now())
    expect(shape.lastSynced()).toBeLessThanOrEqual(Date.now() - start)
  })

  it(`should throw on a reserved parameter`, async ({ aborter }) => {
    expect(() => {
      const shapeStream = new ShapeStream({
        url: `${BASE_URL}/v1/shape`,
        params: {
          table: `foo`,
          // @ts-expect-error should not allow reserved parameters
          live: `false`,
        },
        liveSse,
        signal: aborter.signal,
      })
      new Shape(shapeStream)
    }).toThrowErrorMatchingSnapshot()
  })

  it(`should notify with the initial value`, async ({
    issuesTableUrl,
    insertIssues,
    aborter,
  }) => {
    const [id] = await insertIssues({ title: `test title` })

    const start = Date.now()
    const shapeStream = new ShapeStream({
      url: `${BASE_URL}/v1/shape`,
      params: {
        table: issuesTableUrl,
      },
      signal: aborter.signal,
      liveSse,
    })
    const shape = new Shape(shapeStream)

    const rows = await new Promise((resolve) => {
      shape.subscribe(({ rows }) => resolve(rows))
    })

    expect(rows).toEqual([{ id: id, title: `test title`, priority: 10 }])
    expect(shape.lastSyncedAt()).toBeGreaterThanOrEqual(start)
    expect(shape.lastSyncedAt()).toBeLessThanOrEqual(Date.now())
    expect(shape.lastSynced()).toBeLessThanOrEqual(Date.now() - start)
  })
})
```

---

## 7. Non-Database Tests with beforeEach/afterEach (test/expired-shapes-cache.test.ts)

```typescript
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ShapeStream } from '../src'
import {
  ExpiredShapesCache,
  expiredShapesCache,
} from '../src/expired-shapes-cache'
import { EXPIRED_HANDLE_QUERY_PARAM } from '../src/constants'

describe(`ExpiredShapesCache`, () => {
  let cache: ExpiredShapesCache
  const shapeUrl = `https://example.com/v1/shape`
  let aborter: AbortController
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    cache = new ExpiredShapesCache()
    expiredShapesCache.clear()
    aborter = new AbortController()
    fetchMock = vi.fn()
    vi.clearAllMocks()
  })

  afterEach(() => aborter.abort())

  it(`should mark shapes as expired and check expiration status`, () => {
    const shapeUrl1 = `https://example.com/v1/shape?table=test1`
    const shapeUrl2 = `https://example.com/v1/shape?table=test2`
    const handle1 = `handle-123`

    // Initially, shape should not have expired handle
    expect(cache.getExpiredHandle(shapeUrl1)).toBe(null)

    // Mark shape as expired
    cache.markExpired(shapeUrl1, handle1)

    // Now shape should return expired handle
    expect(cache.getExpiredHandle(shapeUrl1)).toBe(handle1)

    // Different shape should not have expired handle
    expect(cache.getExpiredHandle(shapeUrl2)).toBe(null)
  })

  it(`should persist expired shapes to localStorage`, () => {
    const shapeUrl = `https://example.com/v1/shape?table=test`
    const handle = `test-handle`

    // Mark shape as expired
    cache.markExpired(shapeUrl, handle)

    // Check that localStorage was updated
    const storedData = JSON.parse(
      localStorage.getItem(`electric_expired_shapes`) || `{}`
    )
    expect(storedData[shapeUrl]).toEqual({
      expiredHandle: handle,
      lastUsed: expect.any(Number),
    })
  })
})
```

---

## 8. Cache Testing with Docker Container Access (test/cache.test.ts)

```typescript
import { describe, expect, assert, inject } from 'vitest'
import { exec } from 'child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { testWithIssuesTable } from './support/test-context'

const maxAge = 1 // seconds
const staleAge = 3 // seconds

enum CacheStatus {
  MISS = `MISS`,
  EXPIRED = `EXPIRED`,
  STALE = `STALE`,
  HIT = `HIT`,
}

function getCacheStatus(res: Response): CacheStatus {
  return res.headers.get(`X-Proxy-Cache`) as CacheStatus
}

export async function clearProxyCache({
  proxyCacheContainerName,
  proxyCachePath,
}: {
  proxyCacheContainerName: string
  proxyCachePath: string
}): Promise<void> {
  return new Promise((res) =>
    exec(
      `docker exec ${proxyCacheContainerName} sh -c 'rm -rf ${proxyCachePath}'`,
      (_) => res()
    )
  )
}

const it = testWithIssuesTable.extend<{
  proxyCacheBaseUrl: string
  clearCache: () => Promise<void>
}>({
  proxyCacheBaseUrl: async ({ clearCache }, use) => {
    await clearCache()
    use(inject(`proxyCacheBaseUrl`))
  },
  clearCache: async ({}, use) => {
    use(
      async () =>
        await clearProxyCache({
          proxyCacheContainerName: inject(`proxyCacheContainerName`),
          proxyCachePath: inject(`proxyCachePath`),
        })
    )
  },
})

describe(`HTTP Proxy Cache`, () => {
  it(`should get a short max-age cache-control header in live mode`, async ({
    insertIssues,
    proxyCacheBaseUrl,
    issuesTableUrl,
  }) => {
    // First request get initial request
    const initialRes = await fetch(
      `${proxyCacheBaseUrl}/v1/shape?table=${issuesTableUrl}&offset=-1`,
      {}
    )

    expect(initialRes.status).toBe(200)
    expect(getCacheStatus(initialRes)).toBe(CacheStatus.MISS)

    // add some data and follow with live request
    await insertIssues({ title: `foo` })
    const searchParams = new URLSearchParams({
      table: issuesTableUrl,
      handle: initialRes.headers.get(`electric-handle`)!,
      offset: initialRes.headers.get(`electric-offset`)!,
      live: `true`,
    })

    const liveRes = await fetch(
      `${proxyCacheBaseUrl}/v1/shape?${searchParams.toString()}`,
      {}
    )
    expect(liveRes.status).toBe(200)
    expect(getCacheStatus(liveRes)).toBe(CacheStatus.MISS)

    // Second request gets a cached response
    const cachedRes = await fetch(
      `${proxyCacheBaseUrl}/v1/shape?${searchParams.toString()}`,
      {}
    )
    expect(cachedRes.status).toBe(200)

    expect(getCacheStatus(cachedRes)).toBe(CacheStatus.HIT)
  })
})
```

---

## Summary of Patterns Used

1. **Global Setup**: Health check + schema creation + context injection
2. **Fixtures**: Chained `.extend()` for composable test setup
3. **Parameterization**: `it.for()` and `describe.for()` for configuration testing
4. **Isolation**: Unique table names with task ID + random suffix
5. **Cleanup**: Per-fixture teardown with error handling
6. **Helpers**: Utility functions for common operations
7. **Typing**: Module augmentation for context injection type safety
8. **Serial Execution**: `fileParallelism: false` for shared database safety
