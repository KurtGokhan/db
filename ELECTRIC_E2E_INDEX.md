# Electric E2E Test Setup - Complete Documentation Index

This directory contains comprehensive documentation about how Electric's TypeScript client implements e2e testing with Docker, Postgres, and Vitest. These patterns are ready to be replicated for TanStack DB.

## Documents in This Set

### 1. ELECTRIC_E2E_PATTERNS.md (Main Reference - 1028 lines)
**Comprehensive guide with detailed explanations and architectural patterns**

Contents:
- Docker orchestration setup and configuration
- Database isolation strategies (schema-based)
- Three/four-level lifecycle management (global, per-file, per-test, per-fixture)
- Setup/teardown patterns and cleanup strategies
- Migration handling (inline SQL approach)
- Test configuration and utilities
- Parameterized testing patterns (`it.for()`, `describe.for()`)
- Real-world usage examples with complete code
- Key architectural patterns and design decisions
- Best practices from Electric
- Replication checklist for TanStack DB
- Environment configuration reference

**Best for:** Understanding the "why" and "how" behind decisions, architectural overview

---

### 2. QUICK_REFERENCE.md (Cheat Sheet - 200+ lines)
**Quick lookup guide with copy-paste templates**

Contents:
- Key files to reference
- Docker Compose templates (minimal, ready to copy)
- Global setup pattern (code template)
- Test context fixtures (code template)
- Parameterized test template
- Configuration values table
- Test isolation strategy diagram
- Fixture inheritance chain
- Common patterns (insert, wait, cleanup)
- Health check pattern
- Environment variables reference
- Critical settings checklist
- Debugging tips
- Performance optimization tips

**Best for:** Quick lookup, finding specific patterns, copy-paste templates

---

### 3. ACTUAL_CODE_EXCERPTS.md (Real Code - 400+ lines)
**Actual code directly from Electric's test suite**

Contents:
- Vitest configuration (with explanations)
- Global setup code (test/support/global-setup.ts)
- Test context fixtures (testWithDbClient, testWithIssuesTable)
- Test helpers (test/support/test-helpers.ts)
- Parameterized tests (it.for examples)
- Parameterized describe blocks (describe.for examples)
- Non-database tests (beforeEach/afterEach pattern)
- Cache testing with Docker container access
- Summary of patterns used

**Best for:** Understanding exact implementation, copy-paste working code, seeing real patterns in action

---

## How to Use These Documents

### Scenario 1: Getting Started with E2E Testing
1. Start with **ELECTRIC_E2E_PATTERNS.md** - Section 1-3 for Docker and database isolation
2. Look at **QUICK_REFERENCE.md** - Copy Docker Compose template
3. Review **ACTUAL_CODE_EXCERPTS.md** - See actual implementations

### Scenario 2: Implementing Fixtures
1. Read **ELECTRIC_E2E_PATTERNS.md** - Section 3 (lifecycle management)
2. Check **QUICK_REFERENCE.md** - Fixture inheritance chain
3. Copy code from **ACTUAL_CODE_EXCERPTS.md** - Section 3 (test context fixtures)

### Scenario 3: Setting Up Parameterized Tests
1. Check **QUICK_REFERENCE.md** - Parameterized test section
2. Read **ELECTRIC_E2E_PATTERNS.md** - Section 6 (parameterized testing)
3. Copy examples from **ACTUAL_CODE_EXCERPTS.md** - Sections 5-6

### Scenario 4: Debugging Test Issues
1. Refer to **QUICK_REFERENCE.md** - Debugging tips section
2. Check **ELECTRIC_E2E_PATTERNS.md** - Section 9 (best practices)
3. Look at **ACTUAL_CODE_EXCERPTS.md** - Error handling patterns

---

## Key Patterns at a Glance

### 1. Docker Composition
```
Postgres (port 54321) + Server (port 3000)
Uses tmpfs for speed, depends_on for ordering
```

### 2. Database Isolation
```
Electric DB (shared)
  -> electric_test schema (created once)
    -> Unique tables per test (task.id + random suffix)
```

### 3. Test Lifecycle
```
Global Setup (once per run)
  ├─ Health check
  ├─ Create test schema
  └─ Provide context
  
Per-Test Fixtures (for each test)
  ├─ Create DB connection
  ├─ Create table
  ├─ Run test
  └─ Cleanup (drop table, close connection)
```

### 4. Fixture Composition
```
testWithDb
  extends testWithDb
    extends testWithDb
      (each level adds more fixtures)
```

### 5. Parameterization
```
const configs = [{ mode: 'a' }, { mode: 'b' }]
it.for(configs)('test', ({ mode }) => ...)
// Runs twice, once per config
```

---

## Electric File References

If you need to look at the actual Electric codebase:

- Docker setup: `~/programs/electric/.support/docker-compose.yml`
- Vitest config: `~/programs/electric/packages/typescript-client/vitest.config.ts`
- Global setup: `~/programs/electric/packages/typescript-client/test/support/global-setup.ts`
- Fixtures: `~/programs/electric/packages/typescript-client/test/support/test-context.ts`
- Helpers: `~/programs/electric/packages/typescript-client/test/support/test-helpers.ts`
- Tests: `~/programs/electric/packages/typescript-client/test/*.test.ts`

---

## Core Concepts Explained

### Schema-Based Isolation (Not Database-Based)
**Why:** Reduces connection overhead, simplifies cleanup, allows serial execution with shared database

### Unique Table Names with Task ID
**Why:** Prevents test collisions, aids debugging, makes it clear which test created the table

### Fixture Composition (test.extend())
**Why:** Reusable, composable, isolated concerns, clear dependency chains

### Global Setup with Health Check
**Why:** Ensures server is ready before tests run, provides context to all tests, handles one-time setup

### Parameterized Tests with it.for() / describe.for()
**Why:** Tests multiple configurations systematically, reduces code duplication, clear test matrix

### Serial Execution (fileParallelism: false)
**Why:** Prevents concurrency issues with shared database, simplifies debugging

---

## Configuration Defaults

| Setting | Value | Can Override |
|---------|-------|--------------|
| Postgres Host | localhost | - |
| Postgres Port | 54321 | - |
| Postgres User | postgres | - |
| Postgres Password | password | - |
| Postgres Database | electric | - |
| Server URL | http://localhost:3000 | `SERVER_URL` env |
| Test Schema | electric_test | hardcoded |
| Health Check Timeout | 10 seconds | in code |
| Parallel Execution | false (serial) | vitest.config.ts |

---

## Critical Settings for Success

1. **Vitest**: `fileParallelism: false` (MUST be disabled for shared DB)
2. **Docker**: `tmpfs` for Postgres data directory (speed)
3. **Docker**: `depends_on: postgres` for backend service (ordering)
4. **Global Setup**: Health check before proceeding (reliability)
5. **Fixtures**: Unique table names (isolation)
6. **Cleanup**: Don't throw in cleanup code (allows subsequent cleanup)

---

## Replication Steps for TanStack DB

1. Create Docker Compose with Postgres + TanStack server
2. Implement global-setup.ts with health check
3. Create test context fixtures with test.extend()
4. Set fileParallelism: false in vitest.config.ts
5. Create unique table names per test with task.id
6. Add parameterized tests with it.for() if needed
7. Use AbortController for stream cleanup
8. Document connection defaults

---

## Additional Resources

These documents reference:
- Vitest 3.0+ (fixture system)
- Node 'pg' library (PostgreSQL client)
- Docker (container orchestration)
- TypeScript (type safety)

---

## Quick Lookup by Topic

**Docker Setup**: See QUICK_REFERENCE.md (Docker Compose section)
**Database Isolation**: See ELECTRIC_E2E_PATTERNS.md Section 2
**Fixtures**: See ACTUAL_CODE_EXCERPTS.md Section 3 or ELECTRIC_E2E_PATTERNS.md Section 3
**Parameterization**: See QUICK_REFERENCE.md (Parameterized Test section)
**Health Check**: See QUICK_REFERENCE.md (Health Check Pattern section)
**Debugging**: See QUICK_REFERENCE.md (Debugging Tips section)
**Real Examples**: See ACTUAL_CODE_EXCERPTS.md (all sections)
**Architectural Overview**: See ELECTRIC_E2E_PATTERNS.md Section 8

---

## File Summary

| File | Size | Purpose | Best For |
|------|------|---------|----------|
| ELECTRIC_E2E_PATTERNS.md | 29KB | Comprehensive reference | Understanding architecture |
| QUICK_REFERENCE.md | 7.7KB | Quick lookup | Finding specific patterns |
| ACTUAL_CODE_EXCERPTS.md | 22KB | Real working code | Copy-paste implementations |
| ELECTRIC_E2E_INDEX.md | This file | Navigation guide | Finding what you need |

---

## Total Documentation Size
Approximately 60KB of comprehensive documentation covering:
- 1000+ lines of detailed explanations
- 400+ lines of real working code
- Copy-paste templates for immediate use
- Architecture diagrams and flow charts
- Best practices and design patterns
- Debugging tips and troubleshooting guides
- Complete configuration reference

---

Generated from exploration of: `~/programs/electric/packages/typescript-client/test`
All code excerpts are actual implementations from Electric's test suite.
