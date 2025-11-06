# Electric TypeScript Client E2E Test Infrastructure & Patterns

## Overview
Electric's TypeScript client uses Vitest as the test framework with comprehensive e2e testing against Docker-containerized Postgres and Electric server. The approach provides excellent patterns for test isolation, parameterized testing, and database management.

---

## 1. DOCKER ORCHESTRATION & SETUP

### Docker Compose Configuration
Location: `~/.support/docker-compose.yml`

The setup uses two main services:

```yaml
version: '3.3'
name: 'electric_example-${PROJECT_NAME:-default}'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: electric
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - 54321:5432
    volumes:
      - ./postgres.conf:/etc/postgresql/postgresql.conf:ro
    tmpfs:
      - /var/lib/postgresql/data
      - /tmp
    command:
      - postgres
      - -c
      - config_file=/etc/postgresql/postgresql.conf

  backend:
    image: electricsql/electric:canary
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/electric?sslmode=disable
      ELECTRIC_INSECURE: true
    ports:
      - 3000:3000
    build:
      context: ../packages/sync-service/
    depends_on:
      - postgres
```

**Key Design Decisions:**
- Postgres uses tmpfs for `/var/lib/postgresql/data` for fast test execution
- Postgres config file loaded from host for custom settings
- Electric backend depends_on postgres for startup ordering
- Insecure mode only for dev/test (NOT production)
- Default credentials hardcoded: `postgres:password`
- Default port mapping: Postgres 54321, Electric 3000

### Connection Details for Tests
Tests connect via:
- Host: `localhost`
- Port: `54321` (Postgres)
- User: `postgres`
- Password: `password`
- Database: `electric`

---

## 2. DATABASE ISOLATION: UNIQUE DATABASES PER TEST

### Schema-Based Isolation Strategy

Rather than creating separate databases, Electric uses **schema isolation**:

**Global Setup** (`test/support/global-setup.ts`):
```typescript
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

**Per-Test Fixture Level Isolation** (`test/support/test-context.ts`):

Each test gets a **unique table name** that includes task ID and random suffix:

```typescript
issuesTableSql: async ({ dbClient, task }, use) => {
  // Creates unique table name like: "issues for ABC123_a1b2c3"
  const tableName = `"issues for ${task.id}_${Math.random()
    .toString(16)
    .replace(`.`, `_`)}"`
  
  // Setup table for test
  await dbClient.query(`
    DROP TABLE IF EXISTS ${tableName};
    CREATE TABLE ${tableName} (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      priority INTEGER NOT NULL
    );
    COMMENT ON TABLE ${tableName} IS 'Created for ${
      task.file?.name.replace(/'/g, `\``) ?? `unknown`
    } - ${task.name.replace(`'`, `\``)}';
  `)
  
  await use(tableName)
  
  // Cleanup table after test
  await dbClient.query(`DROP TABLE ${tableName}`)
},
```

**Multi-Type Table Isolation** - Same pattern for complex types:

```typescript
tableSql: async ({ dbClient, task }, use) => {
  const tableName = `"multitype table for ${task.id}_${Math.random()
    .toString(16)
    .replace(`.`, `_`)}"`

  await dbClient.query(`
    DROP TABLE IF EXISTS ${tableName};
    DROP TYPE IF EXISTS mood;
    CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');
    CREATE TABLE ${tableName} (
      txt VARCHAR,
      i2 INT2 PRIMARY KEY,
      ...
    )`)

  await use(tableName)

  // Full cleanup including custom types
  await dbClient.query(`
    DROP TABLE ${tableName};
    DROP TYPE IF EXISTS mood;
  `)
},
```

**Benefits of This Approach:**
- Single database connection simplifies setup/teardown
- Tests can run serially without interference
- Clear table names aid in debugging (include test file + test name + random suffix)
- Comment on table shows which test created it
- Schema-based rather than database-based reduces connection overhead
- Full cleanup including custom types and domains

---

## 3. SETUP/TEARDOWN PATTERNS & LIFECYCLE MANAGEMENT

### Three-Level Lifecycle Management

#### Level 1: Global Setup (One-time per test run)
File: `vitest.config.ts`
```typescript
export default defineConfig({
  test: {
    globalSetup: `test/support/global-setup.ts`,
    setupFiles: [`vitest-localstorage-mock`],
    fileParallelism: false,  // Critical: prevents parallel file execution
    coverage: { ... },
    reporters: [`default`, `junit`],
    outputFile: `./junit/test-report.junit.xml`,
    environment: `jsdom`,
  },
})
```

Key settings:
- `fileParallelism: false` - Tests run serially (important for shared database)
- `globalSetup` runs once before all tests
- `setupFiles` runs before each test file

#### Level 2: Global Setup/Teardown
File: `test/support/global-setup.ts`
```typescript
export default async function ({ provide }: GlobalSetupContext) {
  // SETUP
  await waitForElectric(url)
  const client = makePgClient()
  await client.connect()
  await client.query(`CREATE SCHEMA IF NOT EXISTS electric_test`)
  
  provide(`baseUrl`, url)
  provide(`testPgSchema`, `electric_test`)
  
  // Return cleanup function (runs once at end of all tests)
  return async () => {
    await client.query(`DROP SCHEMA electric_test CASCADE`)
    await client.end()
  }
}
```

#### Level 3: Fixture-Level Lifecycle (Per test)
File: `test/support/test-context.ts`
```typescript
export const testWithDbClient = test.extend<{
  dbClient: Client
  aborter: AbortController
  baseUrl: string
  pgSchema: string
  clearShape: ClearShapeFn
}>({
  // Setup: Create connection, inject context
  dbClient: async ({}, use) => {
    const searchOption = `-csearch_path=${inject(`testPgSchema`)}`
    const client = makePgClient({ options: searchOption })
    await client.connect()
    
    // Pass client to test
    await use(client)
    
    // Cleanup: Close connection
    await client.end()
  },
  
  // Setup: Create abort controller for cancellation
  aborter: async ({}, use) => {
    const controller = new AbortController()
    await use(controller)
    
    // Cleanup: Abort any pending operations
    controller.abort(`Test complete`)
  },
  
  // Inject provided values
  baseUrl: async ({}, use) => use(inject(`baseUrl`)),
  pgSchema: async ({}, use) => use(inject(`testPgSchema`)),
  
  // Custom utility: Clear shape caches
  clearShape: async ({}, use) => {
    await use(async (table: string, options = {}) => {
      const baseUrl = inject(`baseUrl`)
      const url = new URL(`${baseUrl}/v1/shape`)
      url.searchParams.set(`table`, table)
      
      if (options.handle) {
        url.searchParams.set(SHAPE_HANDLE_QUERY_PARAM, options.handle)
      }
      
      const resp = await fetch(url.toString(), { method: `DELETE` })
      if (!resp.ok && resp.status !== 404) {
        throw new Error(`Could not delete shape`)
      }
    })
  },
})
```

#### Level 4: Table Fixtures (Extends dbClient)
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
    const tableName = `"issues for ${task.id}_${...}"`
    await dbClient.query(`CREATE TABLE ${tableName} (...)`)
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
    }
  },
  
  // Insert helper
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
})
```

### Explicit beforeEach/afterEach Patterns (For non-database tests)

For tests that don't need database access:

```typescript
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

describe(`ExpiredShapesCache`, () => {
  let cache: ExpiredShapesCache
  let aborter: AbortController

  beforeEach(() => {
    localStorage.clear()
    cache = new ExpiredShapesCache()
    aborter = new AbortController()
    vi.clearAllMocks()
  })

  afterEach(() => aborter.abort())

  it(`should mark shapes as expired`, () => {
    // test code
  })
})
```

---

## 4. MIGRATION HANDLING

Electric doesn't use traditional migrations in the test setup. Instead:

1. **Global setup creates schema**: `CREATE SCHEMA IF NOT EXISTS electric_test`
2. **Per-test fixture creates tables**: Each test creates its own tables with exact schema
3. **Table structure is inline SQL**: No migration files needed for tests
4. **Custom types created per-test**: Types like `mood` enum are created per test if needed

**Example: Multi-type table setup with custom types**
```typescript
await dbClient.query(`
  DROP TABLE IF EXISTS ${tableName};
  DROP TYPE IF EXISTS mood;
  DROP TYPE IF EXISTS complex;
  DROP DOMAIN IF EXISTS posint;
  
  CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');
  CREATE TYPE complex AS (r double precision, i double precision);
  CREATE DOMAIN posint AS integer CHECK (VALUE > 0);
  
  CREATE TABLE ${tableName} (
    txt VARCHAR,
    i2 INT2 PRIMARY KEY,
    i4 INT4,
    i8 INT8,
    f8 FLOAT8,
    b BOOLEAN,
    json JSON,
    jsonb JSONB,
    ints INT8[],
    ...
  )
`)

// Cleanup includes all types and domains
await dbClient.query(`
  DROP TABLE ${tableName};
  DROP TYPE IF EXISTS mood;
  DROP TYPE IF EXISTS complex;
  DROP DOMAIN IF EXISTS posint;
`)
```

**Why this approach:**
- Tests are self-contained and don't depend on external migration state
- Schema is visible where it's used
- Easy to understand what data each test expects
- No migration versioning complexity for tests
- Clear cleanup in same file as setup

---

## 5. TEST CONFIGURATION & UTILITIES

### Vitest Configuration
File: `vitest.config.ts`
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

### Health Check Pattern
File: `test/support/global-setup.ts`
```typescript
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
```

**Key utilities:**
- Polls health endpoint until status is "active"
- 10 second timeout before failure
- Recursive polling (retry until success or timeout)

### Database Client Helper
File: `test/support/test-helpers.ts`
```typescript
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
```

**Design:**
- Encapsulates connection defaults
- Allows overrides for specific tests (e.g., search_path for schemas)
- Uses "pg" library (PostGres native client)

### Context Providers (Vitest 3.0+)
```typescript
declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string
    proxyCacheBaseUrl: string
    testPgSchema: string
    proxyCacheContainerName: string
    proxyCachePath: string
  }
}
```

Values are injected in tests via `inject()`:
```typescript
const BASE_URL = inject(`baseUrl`)
```

### Message Waiting Helper
File: `test/support/test-helpers.ts`
```typescript
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

## 6. PARAMETERIZED TESTING PATTERNS

### Simple Parameter List
File: `test/integration.test.ts`
```typescript
const fetchAndSse = [{ liveSse: false }, { liveSse: true }]

// Parameterized describe block
describe(`HTTP Sync`, () => {
  // Test runs twice: once with liveSse=false, once with liveSse=true
  it.for(fetchAndSse)(
    `should work with empty shape/table (liveSSE=$liveSse)`,
    async ({ liveSse }, { issuesTableUrl, aborter }) => {
      const issueStream = new ShapeStream({
        url: `${BASE_URL}/v1/shape`,
        params: {
          table: issuesTableUrl,
        },
        subscribe: false,
        signal: aborter.signal,
        liveSse,  // Parameter from the array
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
})
```

### Parameterized Describe Block
File: `test/client.test.ts`
```typescript
const fetchAndSse = [{ liveSse: false }, { liveSse: true }]

describe.for(fetchAndSse)(`Shape (liveSSE=$liveSse)`, ({ liveSse }) => {
  // All tests in this describe run twice (once per parameter set)
  
  it(`should sync an empty shape`, async ({ issuesTableUrl, aborter }) => {
    const start = Date.now()
    const shapeStream = new ShapeStream({
      url: `${BASE_URL}/v1/shape`,
      params: {
        table: issuesTableUrl,
      },
      signal: aborter.signal,
      liveSse,  // Available from describe scope
    })
    const shape = new Shape(shapeStream)

    expect(await shape.value).toEqual(new Map())
    expect(await shape.rows).toEqual([])
    expect(shape.lastSyncedAt()).toBeGreaterThanOrEqual(start)
  })

  it(`should notify with the initial value`, async ({
    issuesTableUrl,
    insertIssues,
    aborter,
  }) => {
    const [id] = await insertIssues({ title: `test title` })

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
  })
})
```

### Parameterized Multi-Type Tests
File: `test/integration.test.ts`
```typescript
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

    const issueStream = new ShapeStream({
      url: `${BASE_URL}/v1/shape`,
      params: {
        table: tableUrl,
      },
      signal: aborter.signal,
      liveSse,
    })

    // ... rest of test
  }
)
```

**Parameterization Key Points:**
- `it.for(params)` runs test multiple times with each param set
- `describe.for(params)` runs all tests in describe block multiple times
- Parameters are destructured in callback: `async ({ liveSse }, { fixtures })`
- Test name uses template string interpolation: `(liveSSE=$liveSse)`
- Works with custom fixtures (like `mit` for multi-type tables)

---

## 7. REAL-WORLD USAGE EXAMPLES

### Complete Integration Test Example
```typescript
import { describe, expect, inject } from 'vitest'
import { testWithIssuesTable as it } from './support/test-context'
import { ShapeStream } from '../src'

const BASE_URL = inject(`baseUrl`)
const fetchAndSse = [{ liveSse: false }, { liveSse: true }]

describe(`HTTP Sync`, () => {
  // Basic test with auto-cleanup via fixtures
  it(`sanity check`, async ({ dbClient, issuesTableSql }) => {
    const result = await dbClient.query(`SELECT * FROM ${issuesTableSql}`)
    expect(result.rows).toEqual([])
  })

  // Parameterized test with initial data
  it.for(fetchAndSse)(
    `should get initial data (liveSSE=$liveSse)`,
    async ({ liveSse }, { insertIssues, issuesTableUrl, aborter }) => {
      // Setup: Insert data
      const uuid = uuidv4()
      await insertIssues({ id: uuid, title: `foo + ${uuid}` })

      // Execute: Create stream and subscribe
      const shapeData = new Map()
      const issueStream = new ShapeStream({
        url: `${BASE_URL}/v1/shape`,
        params: {
          table: issuesTableUrl,
        },
        signal: aborter.signal,
        liveSse,
      })

      // Wait for data
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

      // Assert
      const values = [...shapeData.values()]
      expect(values).toMatchObject([{ title: `foo + ${uuid}` }])
      
      // Cleanup: Automatic! Fixtures handle:
      // - Table drops (issuesTableSql fixture)
      // - Shape cache clears (issuesTableUrl fixture)
      // - Connection closes (dbClient fixture)
      // - Stream aborts (aborter fixture)
    }
  )
})
```

### Cache Testing with Proxy Container Access
File: `test/cache.test.ts`
```typescript
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

describe(`HTTP Proxy Cache`, () => {
  it(`should get a short max-age cache-control header in live mode`, async ({
    insertIssues,
    proxyCacheBaseUrl,
    issuesTableUrl,
  }) => {
    // First request gets initial request
    const initialRes = await fetch(
      `${proxyCacheBaseUrl}/v1/shape?table=${issuesTableUrl}&offset=-1`,
      {}
    )

    expect(initialRes.status).toBe(200)
    expect(getCacheStatus(initialRes)).toBe(CacheStatus.MISS)

    // Add some data and follow with live request
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

    // Second request gets cached response
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

## 8. KEY ARCHITECTURAL PATTERNS

### Fixture Composition Pattern
The test fixtures form a chain where each level builds on the previous:

```
vitest.config.ts (global setup + setup files)
  ↓
test/support/global-setup.ts (health check + schema creation)
  ↓
test/support/test-context.ts - testWithDbClient (DB connection)
  ↓
test/support/test-context.ts - testWithIssuesTable extends testWithDbClient
  ↓
Individual tests using testWithIssuesTable
```

Each level adds new fixtures while inheriting parent fixtures:
- `testWithDbClient` adds: `dbClient`, `aborter`, `baseUrl`, `pgSchema`, `clearShape`
- `testWithIssuesTable` adds: `issuesTableSql`, `issuesTableUrl`, `issuesTableKey`, `insertIssues`, `deleteIssue`, `updateIssue`, etc.
- Custom test extends can further extend (like `proxyCacheBaseUrl`, `clearCache`)

### Lifecycle Management Pattern
```
SETUP                          USE                        TEARDOWN
├─ Create client ────────────→ Test runs ────────────────→ End connection
├─ Create AbortController ────→ Signal available ────────→ Abort
├─ Create table ──────────────→ Query available ────────→ Drop table
├─ Create helpers ────────────→ Methods available ───────→ (auto-cleanup)
└─ Inject context ────────────→ Injected values ready ──→ Cleanup
```

### Test Isolation Pattern
```
Global Schema: electric_test (created once, dropped once)
    │
    ├─ Test 1: creates "issues for ABC123_xyz" table
    │   ├─ Test runs
    │   └─ DROP table
    │
    ├─ Test 2: creates "issues for DEF456_abc" table  
    │   ├─ Test runs
    │   └─ DROP table
    │
    └─ Test 3: creates "issues for GHI789_def" table
        ├─ Test runs
        └─ DROP table
```

Each test has:
- Unique table names (task.id + random suffix)
- Isolated data (no cross-test pollution)
- Full cleanup (drop table + clear shapes + close connections)
- Comments showing which test created the table (helpful for debugging)

### Error Resilience Pattern
```typescript
try {
  await clearShape(urlAppropriateTable)
} catch (_) {
  // ignore - clearShape has its own logging
  // we don't want to interrupt cleanup
}
```

Cleanup code doesn't throw, allowing subsequent cleanup steps to run even if one fails.

---

## 9. TESTING BEST PRACTICES FROM ELECTRIC

1. **Serial Execution**: `fileParallelism: false` prevents concurrency issues with shared database
2. **Health Checks**: Wait for Electric to be "active" before running tests
3. **Unique Table Names**: Use task ID + random suffix to prevent collisions
4. **Full Cleanup**: Always drop tables, clear caches, close connections
5. **Fixture Composition**: Build complex fixtures from simpler ones
6. **Context Injection**: Use Vitest's `provide()`/`inject()` for test-wide values
7. **Abort Controllers**: Use AbortSignal for clean stream shutdown
8. **Parameterized Tests**: Use `it.for()` and `describe.for()` for testing multiple configurations
9. **Helpful Comments**: Add SQL comments showing which test created tables
10. **Graceful Degradation**: Catch errors in cleanup code to avoid masking test failures

---

## 10. REPLICATION CHECKLIST FOR TANSTACK DB

When implementing similar e2e testing for TanStack DB:

- [ ] Create Docker Compose with Postgres + server service
- [ ] Implement global setup that:
  - [ ] Waits for server health endpoint
  - [ ] Creates shared test schema/database
  - [ ] Provides context values (baseUrl, testDb, etc.)
  - [ ] Returns cleanup function
- [ ] Create test fixtures extending from base test:
  - [ ] Database client fixture
  - [ ] AbortController fixture
  - [ ] Table creation fixtures with unique names
  - [ ] Helper fixtures (insert, delete, update, query)
- [ ] Set `fileParallelism: false` in vitest.config.ts
- [ ] Use `.extend()` to compose fixtures
- [ ] Add parameterized tests with `it.for()` and `describe.for()`
- [ ] Use `inject()` to access provided context
- [ ] Clean up resources in fixture teardown phase
- [ ] Create health check function for server readiness
- [ ] Document connection details and environment setup

---

## File Structure Reference

```
packages/typescript-client/
├── vitest.config.ts
├── test/
│   ├── support/
│   │   ├── global-setup.ts        # One-time setup for all tests
│   │   ├── test-context.ts         # Fixture definitions
│   │   └── test-helpers.ts         # Utility functions
│   ├── integration.test.ts         # Main e2e tests
│   ├── client.test.ts              # Client functionality tests
│   ├── cache.test.ts               # Cache + proxy tests
│   └── ... other test files
└── src/
    └── ... source code

.support/
└── docker-compose.yml              # Docker services
```

---

## Environment Configuration

### Database Connection (hardcoded in test-helpers.ts)
```
Host: localhost
Port: 54321
User: postgres
Password: password
Database: electric
Search path: electric_test (for tests)
```

### Electric Server
```
URL: http://localhost:3000
Health endpoint: http://localhost:3000/v1/health
```

### Proxy Cache (optional, for cache tests)
```
Container: electric_dev-nginx-1
URL: http://localhost:3002
Cache path: /var/cache/nginx/*
```

These can be overridden via environment variables in global-setup.ts:
```typescript
const url = process.env.ELECTRIC_URL ?? `http://localhost:3000`
const proxyUrl = process.env.ELECTRIC_PROXY_CACHE_URL ?? `http://localhost:3002`
```
