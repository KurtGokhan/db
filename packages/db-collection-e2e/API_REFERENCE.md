# TanStack DB API Reference for E2E Tests

This document describes the APIs used in the e2e test suite based on code exploration.

## Core Imports

```typescript
import { createCollection } from '@tanstack/db'
import { createLiveQueryCollection, Query, eq, gt, gte, lt, lte, and, or, not, isNull, inArray } from '@tanstack/db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
```

## Creating Collections

### Electric Collections

```typescript
import { electricCollectionOptions } from '@tanstack/electric-db-collection'

const collection = createCollection(
  electricCollectionOptions({
    id: 'my-collection',
    shapeOptions: {
      url: 'http://localhost:3000/v1/shape',
      params: {
        table: 'schema.table_name',
      },
    },
    syncMode: 'on-demand', // or 'eager' or 'progressive'
    getKey: (item) => item.id,
    startSync: false, // Manual start for tests
  })
)
```

### Query Collections

```typescript
import { queryCollectionOptions } from '@tanstack/query-db-collection'

const collection = createCollection(
  queryCollectionOptions({
    id: 'my-query-collection',
    queryFn: async (opts) => {
      // Fetch data from backend
      return await fetchData(opts)
    },
    getKey: (item) => item.id,
  })
)
```

## Creating Live Queries

### Basic Syntax

```typescript
const liveQuery = createLiveQueryCollection((q) =>
  q
    .from({ user: usersCollection })
    .where(({ user }) => eq(user.active, true))
    .select(({ user }) => ({
      id: user.id,
      name: user.name,
    }))
)

// Execute query
await liveQuery.preload()

// Get results
const results = Array.from(liveQuery.state.values())
const count = liveQuery.size
```

### With Configuration Object

```typescript
const liveQuery = createLiveQueryCollection({
  id: 'my-live-query',
  query: (q) => q
    .from({ user: usersCollection })
    .where(({ user }) => eq(user.active, true)),
  getKey: (item) => item.id,
  startSync: true, // Auto-start
})
```

## Predicate Functions

### Comparison Operators

```typescript
// Equality
eq(user.age, 25)              // user.age === 25
ne(user.age, 25)              // user.age !== 25 (NOT eq)

// Comparison
gt(user.age, 25)              // user.age > 25
gte(user.age, 25)             // user.age >= 25
lt(user.age, 25)              // user.age < 25
lte(user.age, 25)             // user.age <= 25

// Array membership
inArray(user.id, ['id1', 'id2', 'id3'])

// Null checks
isNull(user.email)            // user.email IS NULL
// Note: isNotNull is not() + isNull()
not(isNull(user.email))       // user.email IS NOT NULL

// String matching
like(user.name, '%alice%')    // Case-sensitive LIKE
ilike(user.name, '%alice%')   // Case-insensitive LIKE
```

### Boolean Logic

```typescript
// AND - all conditions must be true
and(
  gt(user.age, 25),
  eq(user.active, true)
)

// OR - at least one condition must be true
or(
  eq(user.age, 25),
  eq(user.age, 30)
)

// NOT - negates condition
not(eq(user.active, true))

// Complex nesting
and(
  or(eq(user.age, 25), eq(user.age, 30)),
  eq(user.active, true)
)
```

## Query Builder Methods

### from()

```typescript
.from({ user: usersCollection })
.from({ user: usersCollection, post: postsCollection })
```

### where()

```typescript
.where(({ user }) => eq(user.active, true))
.where(({ user }) => and(
  gt(user.age, 18),
  eq(user.active, true)
))

// Multiple where() calls are ANDed
.where(({ user }) => gt(user.age, 18))
.where(({ user }) => eq(user.active, true))
```

### join()

```typescript
// Inner join
.join(
  { post: postsCollection },
  ({ user, post }) => eq(user.id, post.userId)
)

// Left join
.leftJoin(
  { post: postsCollection },
  ({ user, post }) => eq(user.id, post.userId)
)

// Multiple joins
.join({ post: postsCollection }, ...)
.join({ comment: commentsCollection }, ...)
```

### select()

```typescript
.select(({ user }) => ({
  id: user.id,
  name: user.name,
  age: user.age,
}))

// With joins
.select(({ user, post }) => ({
  userId: user.id,
  userName: user.name,
  postTitle: post.title,
}))

// Note: select is optional, returns all fields if omitted
```

### orderBy()

```typescript
// Single field, ascending
.orderBy(({ user }) => user.age) // defaults to asc

// Single field, explicit direction
.orderBy(({ user }) => user.age, 'desc')

// Multiple fields
.orderBy(({ user }) => [user.age, user.name])

// With explicit options
.orderBy(({ user }) => user.age, { direction: 'desc', nulls: 'last' })
```

### limit() and offset()

```typescript
// Limit only
.limit(10)

// Limit + offset (pagination)
.limit(10)
.offset(20) // Skip first 20, take next 10

// Just offset
.offset(50)
```

## Collection API

### Properties

```typescript
collection.size                // Number of items
collection.state               // Map<Key, Item>
collection.status              // 'initial' | 'loading' | 'ready' | 'cleaned-up'
collection.compareOptions      // String collation config
```

### Methods

```typescript
// Preload collection data
await collection.preload()

// Get item by key
const item = collection.get(key)

// Check if key exists
const has = collection.has(key)

// Cleanup
await collection.cleanup()

// Access sync manager
collection._sync.loadSubset(options)
```

### Sync Manager (_sync)

```typescript
// Load subset (for on-demand mode)
await collection._sync.loadSubset({
  where: eq(ref('age'), val(25)),
  limit: 10,
  orderBy: [...],
  subscription: subscription, // optional
})

// Check sync mode
collection._sync.syncMode // 'eager' | 'on-demand' | 'progressive'

// Check loading status
collection._sync.isLoadingMore
```

## Deduplication API

```typescript
import { DeduplicatedLoadSubset } from '@tanstack/db/src/query/subset-dedupe'

const dedupe = new DeduplicatedLoadSubset({
  loadSubset: async (options) => {
    // Your load logic
  },
  onDeduplicate: (options) => {
    console.log('Deduplicated call:', options)
  },
})

// Use it
await dedupe.loadSubset({ where: gt(ref('age'), val(25)) })
```

## Working with Results

### Get All Results

```typescript
const liveQuery = createLiveQueryCollection(...)
await liveQuery.preload()

// As array
const resultsArray = Array.from(liveQuery.state.values())

// Iterate
for (const [key, item] of liveQuery.state) {
  console.log(key, item)
}

// Count
const count = liveQuery.size
```

### Subscribe to Changes

```typescript
const subscription = liveQuery.subscribeChanges((changes) => {
  console.log('Changes:', changes)
})

// Cleanup
subscription.unsubscribe()
```

## Collection Configuration Options

### String Collation

```typescript
const collection = createCollection(
  electricCollectionOptions({
    // ...other options
    defaultStringCollation: {
      stringSort: 'locale', // or 'lexical'
      locale: 'en-US', // optional, for locale sort
      sensitivity: 'base', // optional: 'base' | 'accent' | 'case' | 'variant'
    },
  })
)

// Or in live query
const liveQuery = createLiveQueryCollection({
  query: (q) => q.from({ user: usersCollection }),
  defaultStringCollation: {
    stringSort: 'locale',
    locale: 'de-DE',
  },
})
```

### Sync Modes

```typescript
syncMode: 'eager'       // Load entire dataset immediately
syncMode: 'on-demand'   // Load subsets as queries request them
syncMode: 'progressive' // Start loading, allow incremental access
```

## Building Predicates with IR

For direct loadSubset calls, use IR builders:

```typescript
import { Func, PropRef, Value } from '@tanstack/db/src/query/ir'

const ref = (path: string) => new PropRef([path])
const val = (value: any) => new Value(value)

const predicate = new Func('eq', [ref('age'), val(25)])

await collection._sync.loadSubset({
  where: predicate,
  limit: 10,
})
```

## Common Patterns for E2E Tests

### Pattern 1: Basic Query Test

```typescript
it('should filter users', async () => {
  const liveQuery = createLiveQueryCollection((q) =>
    q
      .from({ user: usersCollection })
      .where(({ user }) => eq(user.age, 25))
  )
  
  await liveQuery.preload()
  
  expect(liveQuery.size).toBe(expected)
  const results = Array.from(liveQuery.state.values())
  expect(results.every(u => u.age === 25)).toBe(true)
})
```

### Pattern 2: Join Test

```typescript
it('should join users and posts', async () => {
  const liveQuery = createLiveQueryCollection((q) =>
    q
      .from({ user: usersCollection })
      .join(
        { post: postsCollection },
        ({ user, post }) => eq(user.id, post.userId)
      )
      .select(({ user, post }) => ({
        userName: user.name,
        postTitle: post.title,
      }))
  )
  
  await liveQuery.preload()
  
  expect(liveQuery.size).toBeGreaterThan(0)
})
```

### Pattern 3: Pagination Test

```typescript
it('should paginate results', async () => {
  const liveQuery = createLiveQueryCollection((q) =>
    q
      .from({ user: usersCollection })
      .orderBy(({ user }) => user.age, 'asc')
      .limit(10)
      .offset(20)
  )
  
  await liveQuery.preload()
  
  expect(liveQuery.size).toBe(10)
})
```

### Pattern 4: LoadSubset Direct Call

```typescript
it('should load subset', async () => {
  await collection._sync.loadSubset({
    where: new Func('gt', [new PropRef(['age']), new Value(25)]),
    limit: 10,
  })
  
  // Check collection state
  expect(collection.size).toBeLessThanOrEqual(10)
})
```

## Utilities and Helpers

### Wait for Collection Ready

```typescript
await waitForCollectionReady(collection, 5000)
expect(collection.status).toBe('ready')
```

### Get Loaded IDs

```typescript
const loadedIds = getLoadedIds(collection)
expect(loadedIds).toEqual(['id1', 'id2', 'id3'])
```

### Assertions

```typescript
// Exact match
assertLoadedExactly(collection, ['id1', 'id2'])

// At least these IDs
assertLoadedAtLeast(collection, ['id1'])

// None of these IDs
assertNotLoaded(collection, ['id99'])

// Verify sorting
assertSorted(results, 'age', 'asc')

// Verify pushdown (no over-fetching)
assertNoPushdownViolation(collection, expectedMaxIds)
```

## Key Concepts

### Live Query Collections

- Created with `createLiveQueryCollection()`
- Run queries against other collections
- Support predicates, joins, aggregates, etc.
- Can be treated as collections themselves

### Base Collections

- Created with `createCollection()`
- Back Live Query Collections
- Have sync configuration (Electric, Query, etc.)
- Support syncMode: eager, on-demand, progressive

### Load Subset

- Available on `collection._sync.loadSubset(options)`
- Only works in on-demand/progressive modes
- Bypassed in eager mode (returns true immediately)
- Can be deduplicated via `DeduplicatedLoadSubset`

## Notes

- Use `.preload()` to execute queries (returns Promise)
- Access results via `.state` (Map) or convert to array
- `startSync: false` for manual control in tests
- Tables in Electric use `schema.table` format
- Predicates use functional approach (not method chaining)

