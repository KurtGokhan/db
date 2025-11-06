# Child Collections – Join-Based Implementation Plan (Ground-Up)

This document restarts the child collections project from the original baseline (before the experimental branch). The goal is to build the feature intentionally with join-based fan-out, per-parent ordering, and reliable validation. The plan incorporates lessons learned from the previous attempt.

---

## High-Level Objectives

1. Allow `Query` instances inside `.select()` to be treated as child collections.
2. Automatically detect the parent-child equality predicate in the child query (`eq(childField, parentField)`).
3. Compile child pipelines as parallel D2 branches, join them with the parent pipeline on the extracted key, and fan out results into per-parent child collections.
4. Ensure per-parent `orderBy`/`limit` use `groupKeyFn`.
5. Enforce runtime/type restrictions (child collections may only pass through selects).
6. Provide clean documentation and tests covering deep nesting, limits, lifecycle, and validation errors.

---

## Phase 0 – Baseline Preparation

**Prerequisites**

- Start from the last known-good revision (no experimental child collection commits).
- The plan assumes existing query compilation (parent queries only) is stable.

**Artifacts**

- Save a copy of this plan in `docs/internal/child-collections-refactor-plan.md`.

---

## Phase 1 – Type System and IR Enhancements

1. **Query IR (`packages/db/src/query/ir.ts`)**
   - Extend `Select` to accept `QueryRef` entries alongside expressions.
   - Allow `QueryRef` to carry the original nested query and alias.

2. **Type definitions (`packages/db/src/query/builder/types.ts`)**
   - Introduce `ChildCollection<T>` as a branded type extending `CollectionImpl<T, …>`.
   - Update `ResultTypeFromSelect` so values of type `QueryBuilder<Context>` resolve to `ChildCollection<GetResult<Context>>`.
   - Ensure the brand is phantom (TypeScript only; runtime object is the `CollectionImpl` we create later).

3. **Builder changes (`packages/db/src/query/builder/index.ts`)**
   - In `buildNestedSelect`, detect `BaseQueryBuilder` instances, convert them to `QueryRef` with a generated alias, and store the IR in the select object.
   - Confirm `ResultTypeFromSelect` produces the correct child collection types.

---

## Phase 2 – Child Query Metadata & Validation Infrastructure

1. **Child collections compiler module (`packages/db/src/query/compiler/child-collections.ts`)**
   - Create helpers:
     - `extractJoinKey(childQuery, parentAliases)` → `JoinKeyInfo` (exactly one `eq(childField, parentField)`).
     - `stripJoinPredicate(childQuery, joinKey)` → `QueryIR` (child WHERE with the parent equality removed, preserving other child predicates).
     - `createGroupKeyFn(parentFieldPath)` → `(row) => parentJoinKey`.
   - Build a lightweight registry:
     - `pushChildCollectionContext()` / `popChildCollectionContext()` (stack of `Set<string>`).
     - `registerChildCollectionField(path: string)` for `select` fields (store full alias path, e.g., `user.posts`).
     - `validateExpressionForChildCollections(expr, context)` that rejects any property ref whose prefix matches a registered child field.

2. **Primary compiler (`packages/db/src/query/compiler/index.ts`)**
   - At the start of `compileQuery` push a new context (pop in `finally`).
   - After optimization but before compiling WHERE/HAVING, traverse `query.select` and register all child fields (recursive; full alias path).
   - Ensure cached compilations do not double-pop the context.
   - Collect child metadata (`ChildCollectionMetadata`: field name, stripped child query, join key, optional groupKeyFn).

3. **Evaluators (`packages/db/src/query/compiler/evaluators.ts`)**
   - When `compileExpression` receives a validation context (e.g., `"WHERE"`, `"HAVING"`), call `validateExpressionForChildCollections`.

4. **Group-by processor (`packages/db/src/query/compiler/group-by.ts`)**
   - Pass `"HAVING"` context into `compileExpression` so validation runs for HAVING clause expressions.

5. **Functional variants**
   - Acknowledge a limitation: `fn.where`/`fn.having` currently bypass IR validation. Document this explicitly (and optionally raise a runtime error if they return values referencing a registered child field).

---

## Phase 3 – Compilation Result Metadata

In `compileQuery`, extend `CompilationResult` to include:

- `childCollections?: Record<string, ChildCollectionMetadata>`

Each metadata entry contains:

- `fieldName` (e.g., `posts` or `user.posts`)
- `modifiedChildQuery` (without the parent predicate)
- `joinKey` (parent/child field paths + child alias)
- `groupKeyFn` (if child query has `orderBy`)

---

## Phase 4 – Runtime Child Collection Manager

**File:** `packages/db/src/query/live/child-collection.ts`

Implement `ChildCollectionManager`:

- Stores per-parent child collections (`Map<parentKey, CollectionImpl>`).
- `getOrCreateChildCollection(parentKey)` creates a child `CollectionImpl` with:
  - `id: <parentId>:<fieldName>:<parentKey>`
  - `getKey` taken from the child source collection.
  - `sync.sync` capturing `begin/write/commit` (store on the collection instance).
  - Immediately call `_sync.startSync()` so `_sync` is available even before subscribers attach.
  - Expose `_sync` under `collection.utils` so tests/consumers can push data if necessary.
- `handleFanout(parentKey, childKey, value, orderByIndex, multiplicity)` writes inserts/updates/deletes to the child `CollectionImpl` via `_sync`.
- `handleParentDelete(parentKey)` tears down the child collection.

---

## Phase 5 – Integrating Child Branches into the Graph

**File:** `packages/db/src/query/live/collection-config-builder.ts`

Build the runtime composition:

1. **Compile Base Parent Pipeline**
   - During initial compilation, store `compilation.childCollections`.

2. **Project Parent Join Keys**
   - After the parent pipeline is created (before finalizing):
     ```ts
     const parentJoinKeyStream = pipeline.pipe(
       map(([resultKey, namespacedRow]) => [
         resultKey,
         extractParentJoinKey(namespacedRow, joinKey.parentFieldPath),
       ])
     )
     ```

3. **Compile Child Branch**
   - For each `ChildCollectionMetadata`:
     - Create a `ChildCollectionManager`.
     - Ensure the child source alias has an input (`graph.newInput()` + subscriber).
     - Compile `modifiedChildQuery` (child pipeline).

4. **Project Child Join Keys**
   - Map the child pipeline to `[parentJoinKey, [childKey, [namespacedRow, orderByIndex]]]`.

5. **Join Parent and Child Streams**
   - Use `innerJoin` from `@tanstack/db-ivm` mirroring `filterBy.ts`:
     ```ts
     const joinedStream = childJoinStream.pipe(
       innerJoin(parentJoinKeyStream, {
         equals: ([childParentKey], [parentJoinKey]) =>
           Object.is(childParentKey, parentJoinKey),
       })
     )
     ```
   - Map the joined output to `[parentKey, [childKey, [namespacedRow, orderByIndex]]]`.

6. **Child OrderBy/Limit (Optional)**
   - If child query has `orderBy`, re-run `orderByWithFractionalIndex` on the child pipeline with:
     ```ts
     groupKeyFn: groupKeyFn ||
       ((namespacedRow) =>
         extractParentJoinKey(namespacedRow, joinKey.childFieldPath))
     ```
   - This partitions top-k per parent.

7. **Fan-Out**
   - Pipe the filtered/joined stream into `output(...)`.
   - For each multiset item:
     - `multiplicity > 0` → call `manager.handleFanout(parentKey, childKey, row, orderByIndex, multiplicity)`.
     - `multiplicity < 0` → treat as delete.

8. **Finalize Graph**
   - After wiring all branches, call `graph.finalize()`.

9. **Parent Inserts/Deletes**
   - When applying parent changes (`applyChanges`), ensure:
     - Parent upsert: call `manager.handleParentUpsert(parentKey)` before attaching child collection to the row.
     - Parent delete: call `manager.handleParentDelete(parentKey)` after removing the row.

---

## Phase 6 – Runtime Validation & Clean-Up

1. **Validation**
   - Verify `compileExpression` is called with contexts `"WHERE"` / `"HAVING"` wherever appropriate.
   - Ensure alias prefixes (e.g., `user.posts`) are rejected; compare both full path and prefix.
   - Document the current limitation for `fn.where`/`fn.having` if unresolved.

2. **Logging**
   - Keep production code free of debug logging; use assertions or throw descriptive errors for unexpected states (e.g., missing `_sync`).

3. **Documentation (`docs/guides/child-collections.md`)**
   - Update examples to reflect the new behavior.
   - Document V1 limitations: single-field join keys, restrictions on using child collections in WHERE/HAVING, etc.
   - Clarify that per-parent ordering and limits are supported.

---

## Phase 7 – Comprehensive Testing

Create dedicated test files under `packages/db/tests/query/`:

1. `child-collections.test.ts`
   - Basic parent → child projection.
   - Ensure `useLiveQuery` can subscribe to child collections (if applicable).

2. `child-collections-nested.test.ts`
   - Grandparent → parent → child nesting.
   - Ensure each level gets its own collection.

3. `child-collections-orderby.test.ts`
   - Parent with `.limit` or `.orderBy` inside child query.
   - Verify each parent gets its own top-k window.

4. `child-collections-errors.test.ts`
   - Missing join key (`MissingJoinKeyError`).
   - Composite join key (`CompositeJoinKeyError`).
   - Invalid join expression (`InvalidJoinExpressionError`).
   - Access child collection in WHERE/HAVING (runtime validation).

5. `child-collections-types.test.ts`
   - Type assertions confirming child collections are not treated as arrays.

6. Lifecycle tests
   - Parent deletion cleans up child collections (no lingering state).

**Test utilities**

- Provide helper functions to push data into parent collections and inspect child collections via `_sync`.

---

## Phase 8 – Verification & Rollout

1. Run the full test suite (`pnpm test --filter packages/db`).
2. Smoke-test manual scenarios (React/Svelte live queries if available).
3. Review documentation and examples for accuracy.
4. Prepare a changeset summarizing the feature and known limitations.

---

## Known Constraints & Follow-Up Work

- `fn.where` / `fn.having` validation may require deeper builder instrumentation.
- `asArray` / `asMap` helpers remain future enhancements.
- Composite join keys (multiple equality predicates) are out of scope for V1; document the limitation.
- Additional features (preloading, GC tuning) can be layered once the core functionality stabilizes.

---

By following this plan step-by-step, we reintroduce child collections with a deliberate, join-based architecture that matches the original design intent while avoiding the pitfalls uncovered during the experimental implementation.
