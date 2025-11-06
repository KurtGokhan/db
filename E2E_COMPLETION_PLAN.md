# E2E Test Suite Completion Plan

## Overview

Complete the e2e test suite implementation by replacing TODO placeholders with actual test code, integrating with TanStack DB APIs, and validating that all tests run successfully.

## Current State

✅ **Infrastructure Complete**
- Package structure created
- Docker Compose configured
- Vitest fixtures implemented
- Seed data generator working
- Test suites structured with ~86 test scenarios

⚠️ **Needs Completion**
- Test suite implementations (currently TODO placeholders)
- Integration with actual @tanstack/db query APIs
- Validation that Docker setup works
- Verification that tests pass
- Performance validation (< 5 minutes)

## Prerequisites Investigation

Before implementing tests, we need to understand:

1. **Query Builder API** - How to create queries with predicates
2. **Collection API** - How `liveQuery()`, `preload()`, `getResult()` work
3. **Predicate API** - `eq()`, `ne()`, `gt()`, `in()`, `isNull()`, etc.
4. **OrderBy API** - How to specify sorting
5. **Pagination API** - `limit`, `offset`, `setWindow()`
6. **Join API** - How multi-collection queries work
7. **LoadSubset API** - How `collection._sync.loadSubset()` works
8. **Deduplication API** - How to hook into deduplication callbacks

## Implementation Phases

---

## Phase 1: API Research & Validation (Priority: Critical)

**Goal**: Understand the actual TanStack DB APIs needed for test implementation

### Tasks

1. **Explore Query Builder API**
   - Find where predicates (`eq`, `ne`, `gt`, etc.) are defined
   - Find where `liveQuery` is implemented
   - Understand query execution model
   - Document API signatures

2. **Explore Collection API**
   - Understand `Collection` interface
   - Find `_sync.loadSubset()` implementation
   - Understand eager vs on-demand modes
   - Document lifecycle methods

3. **Explore Electric Collection Specifics**
   - How Electric collections are created
   - How to configure shape options
   - How sync works with Electric
   - How to query Electric collections

4. **Explore Query Collection Specifics**
   - How Query collections differ from Electric
   - How to provide query functions
   - How to handle on-demand loading

5. **Create API Reference Document**
   - Document all APIs needed for tests
   - Include example usage
   - Note any limitations or gotchas

**Deliverables**:
- `API_REFERENCE.md` with documented APIs
- Understanding of what's possible vs what needs workarounds

**Estimated Time**: 4-6 hours

---

## Phase 2: Docker & Infrastructure Validation (Priority: High)

**Goal**: Ensure Docker setup works and can run basic tests

### Tasks

1. **Test Docker Compose**
   - Start services: `docker compose up -d`
   - Verify Postgres is healthy
   - Verify Electric is healthy
   - Check logs for errors

2. **Test Database Connection**
   - Connect to Postgres from Node
   - Create test schema
   - Create test tables
   - Insert test data
   - Query test data

3. **Test Electric Connection**
   - Connect to Electric HTTP API
   - Verify shape API works
   - Test basic shape stream

4. **Test Vitest Setup**
   - Run a simple test
   - Verify global setup runs
   - Verify fixtures work
   - Verify cleanup works

5. **Fix Any Issues**
   - Update Docker config if needed
   - Fix connection issues
   - Update global setup if needed

**Deliverables**:
- Working Docker setup
- Validated database connectivity
- Validated Electric connectivity
- Basic test runs successfully

**Estimated Time**: 2-4 hours

---

## Phase 3: Seed Data Implementation (Priority: High)

**Goal**: Ensure seed data can be inserted into test database

### Tasks

1. **Implement Data Insertion**
   - Update `insertSeedData` fixture
   - Handle SQL escaping correctly
   - Handle date serialization
   - Handle JSON serialization

2. **Test Seed Data**
   - Insert seed data into database
   - Query back and verify
   - Check data distributions
   - Verify foreign key relationships

3. **Create Validation Script**
   - Script to verify seed data
   - Check record counts
   - Check data quality

**Deliverables**:
- Working seed data insertion
- Validated data in database
- Verification script

**Estimated Time**: 2-3 hours

---

## Phase 4: Implement Predicates Suite (Priority: High)

**Goal**: Complete all predicate tests with actual implementations

### Tasks

1. **Implement Basic Equality Tests**
   - `eq()` on string, number, boolean, date, UUID
   - Verify query results
   - Verify predicate pushdown

2. **Implement Comparison Tests**
   - `gt()`, `gte()`, `lt()`, `lte()`
   - Test with numbers and dates
   - Verify ordering

3. **Implement `in()` Tests**
   - Test with string, number, UUID arrays
   - Test empty array
   - Verify results

4. **Implement Null Tests**
   - `isNull()`, `isNotNull()`
   - Test on nullable fields
   - Test soft delete pattern

5. **Implement Boolean Logic Tests**
   - `and()`, `or()`, `not()`
   - Complex nested predicates
   - Verify correct evaluation

6. **Implement Pushdown Verification**
   - Check collection state after query
   - Verify only matching records loaded
   - Use `assertLoadedExactly()`

**Deliverables**:
- 20 working predicate tests
- All tests passing
- Pushdown verified

**Estimated Time**: 6-8 hours

---

## Phase 5: Implement Pagination Suite (Priority: High)

**Goal**: Complete all pagination and ordering tests

### Tasks

1. **Implement OrderBy Tests**
   - Single field ascending/descending
   - Multiple fields
   - String, number, date sorting
   - Verify with `assertSorted()`

2. **Implement Limit Tests**
   - Basic limit
   - limit=0
   - limit > dataset size
   - Verify exact count

3. **Implement Offset Tests**
   - Basic offset
   - Offset + limit (pagination)
   - Offset beyond dataset
   - Verify correct records

4. **Implement SetWindow Tests**
   - Change window dynamically
   - Call during loading
   - Overlapping windows
   - Non-contiguous windows

5. **Implement Complex Scenarios**
   - Predicates + orderBy + limit + offset
   - Multi-page navigation
   - Edge cases

**Deliverables**:
- 15 working pagination tests
- All tests passing
- Window management verified

**Estimated Time**: 4-6 hours

---

## Phase 6: Implement Joins Suite (Priority: Medium)

**Goal**: Complete all multi-collection join tests

### Tasks

1. **Implement Two-Collection Joins**
   - Users + Posts join
   - With predicates
   - With ordering
   - With pagination

2. **Implement Three-Collection Joins**
   - Users + Posts + Comments
   - Complex predicates
   - Mixed syncModes

3. **Implement Pushdown Verification**
   - Check each collection's state
   - Verify minimal data loaded
   - Verify relationships maintained

4. **Implement SetWindow on Joins**
   - Window changes on joined queries
   - Multi-collection loading

**Deliverables**:
- 12 working join tests
- All tests passing
- Multi-collection verified

**Estimated Time**: 4-6 hours

---

## Phase 7: Implement Deduplication Suite (Priority: Medium)

**Goal**: Complete deduplication verification tests

### Tasks

1. **Implement Deduplication Tracking**
   - Hook into loadSubset callback
   - Track actual vs deduplicated calls
   - Create counter utility

2. **Implement Identical Query Tests**
   - Multiple identical queries
   - Verify single backend call
   - Use `assertDeduplicationOccurred()`

3. **Implement Overlapping Tests**
   - Subset predicates
   - Verify deduplication logic
   - Test various overlap scenarios

4. **Implement Concurrent Tests**
   - Queries during loading
   - Rapid bursts
   - Race condition verification

**Deliverables**:
- 8 working deduplication tests
- All tests passing
- Callback verification working

**Estimated Time**: 3-5 hours

---

## Phase 8: Implement Remaining Suites (Priority: Low)

**Goal**: Complete collation, mutations, live updates, regression suites

### Tasks

1. **Collation Suite** (~8 tests)
   - Default collation
   - Custom collation
   - Case sensitivity
   - Query-level override

2. **Mutations Suite** (~10 tests)
   - Insert, update, delete
   - Soft delete
   - Concurrent mutations
   - Reactive updates

3. **Live Updates Suite** (~8 tests, Electric only)
   - Backend mutations
   - Reactive query updates
   - Subscription lifecycle

4. **Regression Suite** (~5 tests)
   - Test specific known bugs
   - Memory #7214245
   - Memory #9874949

**Deliverables**:
- 31 additional tests implemented
- All tests passing
- Regression tests catching known issues

**Estimated Time**: 6-10 hours

---

## Phase 9: Electric Collection Integration (Priority: High)

**Goal**: Complete Electric collection e2e integration

### Tasks

1. **Complete Setup Function**
   - Create collections with proper config
   - Use test context (tables, schema)
   - Start sync properly

2. **Wire Up Test Suites**
   - Create proper `getConfig()` function
   - Pass to each test suite
   - Uncomment suite runners

3. **Run Electric Tests**
   - Run all suites
   - Fix any Electric-specific issues
   - Verify all pass

**Deliverables**:
- Working Electric e2e tests
- All suites running
- All tests passing

**Estimated Time**: 3-5 hours

---

## Phase 10: Query Collection Integration (Priority: Medium)

**Goal**: Complete Query collection e2e integration

### Tasks

1. **Complete Mock Backend**
   - Implement predicate evaluation
   - Implement sorting logic
   - Implement pagination logic

2. **Complete Setup Function**
   - Create Query collections
   - Wire up mock backend
   - Configure on-demand mode

3. **Wire Up Test Suites**
   - Create proper `getConfig()` function
   - Pass to each test suite
   - Skip Live Updates suite

4. **Run Query Tests**
   - Run all applicable suites
   - Fix any Query-specific issues
   - Verify all pass

**Deliverables**:
- Working Query e2e tests
- Mock backend complete
- All tests passing

**Estimated Time**: 4-6 hours

---

## Phase 11: Performance Optimization (Priority: Medium)

**Goal**: Ensure test suite runs in < 5 minutes

### Tasks

1. **Measure Current Performance**
   - Run full suite
   - Time each test
   - Identify slow tests

2. **Optimize Slow Tests**
   - Reduce data if possible
   - Parallelize where safe
   - Optimize queries

3. **Optimize Infrastructure**
   - Tune Docker resources
   - Optimize Postgres config
   - Use connection pooling

4. **Verify Target Met**
   - Run full suite multiple times
   - Verify < 5 minutes consistently

**Deliverables**:
- Performance measurements
- Optimized tests
- < 5 minute execution time

**Estimated Time**: 2-4 hours

---

## Phase 12: CI/CD Validation (Priority: Medium)

**Goal**: Ensure tests run successfully in CI

### Tasks

1. **Test GitHub Actions Workflow**
   - Push to branch
   - Verify workflow runs
   - Check Docker setup in CI

2. **Fix CI Issues**
   - Update workflow if needed
   - Fix environment variables
   - Fix Docker timeouts

3. **Add Status Badge**
   - Add to README
   - Show test status

**Deliverables**:
- Working CI pipeline
- Tests passing in CI
- Status badge added

**Estimated Time**: 2-3 hours

---

## Phase 13: Documentation & Examples (Priority: Low)

**Goal**: Complete documentation with real examples

### Tasks

1. **Update README with Real Examples**
   - Replace placeholder code
   - Add actual test examples
   - Update integration guide

2. **Create Example Integration**
   - Example for new collection type
   - Step-by-step guide
   - Working code samples

3. **Add Troubleshooting Guide**
   - Common issues
   - Solutions
   - Debug tips

**Deliverables**:
- Updated README
- Example integration
- Troubleshooting guide

**Estimated Time**: 2-3 hours

---

## Total Estimated Time

- **Phase 1**: 4-6 hours (API Research)
- **Phase 2**: 2-4 hours (Docker Validation)
- **Phase 3**: 2-3 hours (Seed Data)
- **Phase 4**: 6-8 hours (Predicates Suite)
- **Phase 5**: 4-6 hours (Pagination Suite)
- **Phase 6**: 4-6 hours (Joins Suite)
- **Phase 7**: 3-5 hours (Deduplication Suite)
- **Phase 8**: 6-10 hours (Remaining Suites)
- **Phase 9**: 3-5 hours (Electric Integration)
- **Phase 10**: 4-6 hours (Query Integration)
- **Phase 11**: 2-4 hours (Performance)
- **Phase 12**: 2-3 hours (CI/CD)
- **Phase 13**: 2-3 hours (Documentation)

**Total**: 44-69 hours (~1-2 weeks of full-time work)

---

## Critical Path

For fastest completion, follow this order:

1. **Phase 1** (API Research) - MUST be first
2. **Phase 2** (Docker Validation) - MUST be early
3. **Phase 3** (Seed Data) - MUST be early
4. **Phase 4** (Predicates) - Foundation for others
5. **Phase 5** (Pagination) - Common dependency
6. **Phase 9** (Electric Integration) - First full integration
7. **Phase 6-8** (Other Suites) - Can parallelize
8. **Phase 10** (Query Integration) - Second integration
9. **Phase 11-13** (Polish) - Final steps

---

## Success Criteria

- ✅ All 86+ test scenarios implemented
- ✅ All tests passing for Electric collection
- ✅ All tests passing for Query collection
- ✅ Deduplication verified via callbacks
- ✅ Predicate pushdown verified
- ✅ Joins work with mixed syncModes
- ✅ Performance < 5 minutes
- ✅ Tests run in CI/CD
- ✅ Documentation complete with real examples
- ✅ No flaky tests

---

## Risk Mitigation

### Risk: APIs don't support needed functionality
**Mitigation**: Start with Phase 1 (API Research) to identify gaps early

### Risk: Tests too slow
**Mitigation**: Measure early, optimize incrementally, use tmpfs

### Risk: Docker issues in CI
**Mitigation**: Test locally first, use proven patterns from Electric

### Risk: Flaky tests
**Mitigation**: Use fixtures properly, ensure proper cleanup, serial execution

### Risk: Deduplication complex to test
**Mitigation**: Study existing deduplication implementation first

---

## Next Immediate Steps

1. Start Phase 1: API Research
2. Document all needed APIs
3. Create simple proof-of-concept test
4. Validate approach before implementing all tests

---

**Status**: Ready to begin Phase 1
**Priority**: High - This is critical infrastructure for query-driven sync
**Dependencies**: None - can start immediately

