# Electric E2E Test Setup - Quick Reference

## Key Files to Reference

1. **Docker Setup**
   - Location: `~/.support/docker-compose.yml`
   - Services: Postgres (54321), Electric (3000)
   - Key: Uses tmpfs for speed, config files for customization

2. **Vitest Config**
   - Location: `vitest.config.ts`
   - Critical setting: `fileParallelism: false`
   - Global setup: `test/support/global-setup.ts`

3. **Test Infrastructure**
   - Global setup: `test/support/global-setup.ts`
   - Fixtures: `test/support/test-context.ts`
   - Helpers: `test/support/test-helpers.ts`

## Copy-Paste Templates

### 1. Docker Compose (postgres + server)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: electric
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - 54321:5432
    tmpfs:
      - /var/lib/postgresql/data
      - /tmp

  backend:
    image: your-server:latest
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/electric?sslmode=disable
    ports:
      - 3000:3000
    depends_on:
      - postgres
```

### 2. Global Setup Pattern

```typescript
import type { GlobalSetupContext } from "vitest/node"
import { makePgClient } from "./test-helpers"

export default async function ({ provide }: GlobalSetupContext) {
  // Health check
  await waitForServer(process.env.SERVER_URL ?? `http://localhost:3000`)

  // Setup
  const client = makePgClient()
  await client.connect()
  await client.query(`CREATE SCHEMA IF NOT EXISTS test_schema`)

  provide(`baseUrl`, process.env.SERVER_URL ?? `http://localhost:3000`)
  provide(`testSchema`, `test_schema`)

  // Cleanup function
  return async () => {
    await client.query(`DROP SCHEMA test_schema CASCADE`)
    await client.end()
  }
}

function waitForServer(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(`Timeout`), 10000)
    const tryHealth = async () =>
      fetch(`${url}/health`)
        .then(async (res) => {
          if (!res.ok) return tryHealth()
          clearTimeout(timeout)
          resolve()
        })
        .catch(() => tryHealth())
    tryHealth()
  })
}
```

### 3. Test Context Fixtures

```typescript
import { test } from "vitest"
import { Client } from "pg"

const testWithDb = test.extend<{
  dbClient: Client
  tableName: string
}>({
  dbClient: async ({}, use) => {
    const client = new Client({
      host: `localhost`,
      port: 54321,
      user: `postgres`,
      password: `password`,
      database: `electric`,
    })
    await client.connect()
    await use(client)
    await client.end()
  },

  tableName: async ({ dbClient, task }, use) => {
    const name = `test_${task.id}_${Math.random().toString(16).slice(2)}`
    await dbClient.query(`
      CREATE TABLE ${name} (
        id UUID PRIMARY KEY,
        data TEXT
      )
    `)
    await use(name)
    await dbClient.query(`DROP TABLE ${name}`)
  },
})

export { testWithDb as it }
```

### 4. Parameterized Test

```typescript
const configs = [{ mode: "fetch" }, { mode: "stream" }]

describe.for(configs)(`Data sync (mode=$mode)`, ({ mode }) => {
  it(`should sync data`, async ({ dbClient, tableName }) => {
    // Test code using mode parameter
    expect(mode).toBe("fetch")
  })
})
```

## Configuration Values

| Key               | Default               | Override                 |
| ----------------- | --------------------- | ------------------------ |
| Postgres Host     | localhost             | -                        |
| Postgres Port     | 54321                 | -                        |
| Postgres User     | postgres              | -                        |
| Postgres Password | password              | -                        |
| Postgres Database | electric              | -                        |
| Server URL        | http://localhost:3000 | `SERVER_URL` env         |
| Test Schema       | electric_test         | hardcoded                |
| Serial Execution  | true                  | `fileParallelism: false` |

## Test Isolation Strategy

```
Database: electric (shared across all tests)
  ↓
Schema: electric_test (created once, dropped once)
  ↓
Per-test tables:
  - "test_ABC123_xyz" (test 1)
  - "test_DEF456_abc" (test 2)
  - "test_GHI789_def" (test 3)
```

Each table:

- Has unique name (task.id + random suffix)
- Is created before test
- Is dropped after test
- May have SQL comment showing origin

## Fixture Inheritance Chain

```
testWithDb
  ├─ dbClient (database connection)
  └─ tableName (unique test table)
     ↓
testWithData extends testWithDb
  ├─ all parent fixtures
  ├─ insertRow (helper function)
  └─ queryRows (helper function)
     ↓
testWithCache extends testWithData
  ├─ all parent fixtures
  ├─ cacheUrl
  └─ clearCache
```

## Common Patterns

### Insert Data

```typescript
await dbClient.query(`INSERT INTO ${tableName} (id, data) VALUES ($1, $2)`, [
  uuid(),
  `test data`,
])
```

### Wait for Changes

```typescript
await new Promise((resolve) => {
  const unsubscribe = stream.subscribe((messages) => {
    if (messages.some(isUpToDate)) {
      unsubscribe()
      resolve()
    }
  })
})
```

### Cleanup with Error Handling

```typescript
try {
  await cleanup()
} catch (e) {
  console.error(`Cleanup failed but continuing:`, e)
  // Don't throw - let other cleanup steps run
}
```

## Health Check Pattern

```typescript
async function waitForServer(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(`Timeout`), 10000)

    const check = async () => {
      try {
        const res = await fetch(`${url}/health`)
        if (res.ok) {
          clearTimeout(timeout)
          resolve()
        } else {
          setTimeout(check, 100)
        }
      } catch {
        setTimeout(check, 100)
      }
    }

    check()
  })
}
```

## Environment Variables

In `global-setup.ts`:

```typescript
const SERVER_URL = process.env.SERVER_URL ?? `http://localhost:3000`
const DB_PORT = process.env.DB_PORT ?? 54321
const DB_PASSWORD = process.env.DB_PASSWORD ?? `password`
```

In `test-helpers.ts`:

```typescript
export function makePgClient(overrides = {}) {
  return new Client({
    host: process.env.DB_HOST ?? `localhost`,
    port: parseInt(process.env.DB_PORT ?? `54321`),
    password: process.env.DB_PASSWORD ?? `password`,
    user: process.env.DB_USER ?? `postgres`,
    database: process.env.DB_NAME ?? `electric`,
    ...overrides,
  })
}
```

## Critical Settings

### Vitest Config

```typescript
{
  test: {
    globalSetup: `test/support/global-setup.ts`,
    fileParallelism: false,  // CRITICAL: Serial execution
    environment: `jsdom`,
  }
}
```

### Docker Compose

```yaml
tmpfs: # Use tmpfs for speed
  - /var/lib/postgresql/data
  - /tmp
depends_on: # Ensure ordering
  - postgres
```

## Debugging Tips

1. **Table names in DB**: Use comments to track origin

   ```sql
   COMMENT ON TABLE "test_ABC_xyz" IS 'Created for file.test.ts - test name'
   ```

2. **Connection issues**: Check health endpoint first

   ```bash
   curl http://localhost:3000/health
   ```

3. **Flaky tests**: Add retry logic to health check

   ```typescript
   const MAX_ATTEMPTS = 50
   for (let i = 0; i < MAX_ATTEMPTS; i++) {
     try {
       return await checkHealth()
     } catch {
       await sleep(100)
     }
   }
   ```

4. **Test isolation**: Verify unique table names

   ```typescript
   console.log(`Using table: ${tableName}`)
   // Should show different name for each test
   ```

5. **Cleanup verification**: Check schema is clean
   ```bash
   docker exec postgres psql -U postgres -c "\dt electric_test.*"
   ```

## Performance Optimization

1. Use tmpfs for Postgres data
2. Keep schema structure simple (only what's needed)
3. Avoid global state between tests
4. Use fixtures for resource management
5. Clean up connections immediately
6. Run tests serially (fileParallelism: false)
