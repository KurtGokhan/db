# Composite ORDER BY Refactor Plan

This plan outlines how to extend ORDER BY optimization so composite prefixes on the leading alias can be paged deterministically (PK tie-break) with a single predicate pushdown, while keeping the current single-column fast path intact. Each section addresses previously identified gaps: trustworthy primary-key metadata, subscription/index wiring, snapshot rework, predicate construction, and regression safety.

---

## 1. Preconditions & Metadata

1. **Declarative primary-key ref**
   - Add an optional `primaryKeyRef` (array of path segments) to collection configuration. The runtime keeps using `config.getKey`, but the compiler/subscriber can rely on the declarative path when present.
   - Store the ref on the collection (e.g. `collection.primaryKeyPath`) so compilation and runtime helpers can retrieve it. When missing, composite optimization simply falls back.

2. **Capability guard**
   - Composite optimization activates only if:
     - A limit is present,
     - Every prefix clause is a `ref` resolved via `followRef`,
     - All resolved refs share the same alias,
     - The collection exposes `primaryKeyRef`,
     - A range index exists on the first prefix column that supports `gt`/`lt`.

3. **Shared tuple helpers**
   - Introduce `packages/db/src/query/order-by/tuple-utils.ts` exposing:
     - `buildTupleEncoder(prefixClauses, pkRef)` → row → tuple array,
     - `makeTupleComparator(prefixClauses, pkClause)` honoring `CompareOptions`,
     - `makeBoundaryPredicate(tuple, clauses)` producing a `BasicExpression` tree that mirrors comparator semantics (mixed ASC/DESC, null ordering).

---

## 2. Compiler Changes (`packages/db/src/query/compiler/order-by.ts`)

1. **Prefix detection**
   - Attempt to build a composite prefix only when the guard passes. Otherwise leave `OrderByOptimizationInfo` untouched.

2. **Metadata emission**
   - Extend `OrderByOptimizationInfo` with optional `composite` payload:
     ```ts
     type CompositeOrderByInfo = {
       prefixClauses: Array<OrderByClause>;         // alias-scoped clauses
       pkRef: PropRef;                              // derived from primaryKeyRef
       tupleEncoder: (row: Record<string, unknown>) => Array<unknown>;
       tupleComparator: (a: unknown, b: unknown) => number;
     }
     ```
   - Preserve existing `valueExtractor`, `compare`, `index`, `limit`, `offset` for downstream operators.

3. **PK clause direction**
   - Append the PK clause using the direction & null ordering of the last prefix clause; if the list is empty (shouldn’t happen), default to ASC/nulls first.

4. **Type updates**
   - Adjust downstream type definitions (e.g. `OrderByOptimizationInfo` consumers) to handle the optional `composite` payload.

---

## 3. Subscription API (`packages/db/src/collection/subscription.ts`)

1. **Request options**
   - Extend `RequestSnapshotOptions` with:
     ```ts
     orderByPrefix?: OrderBy;
     limit?: number;
     boundaryPredicate?: BasicExpression<boolean>;
     ```
   - All fields remain optional; existing callers behave exactly as today.

2. **Invoke `currentStateAsChanges`**
   - Pass `orderByPrefix`/`limit` when provided so the snapshot logic can use the composite path.

3. **Pushdown call**
   - Combine existing `where` with `boundaryPredicate` (if present) before invoking `_sync.loadSubset({ where, orderBy: orderByPrefix ?? orderBy, limit })`.
   - No changes to `_sync.loadSubset` signature and no new dedupe keys, keeping compatibility with predicate caching.

---

## 4. CollectionSubscriber (`packages/db/src/query/live/collection-subscriber.ts`)

1. **Index wiring**
   - Continue calling `subscription.setOrderByIndex(index)` regardless of composite/scalar branch so live update filtering still leverages the range index.

2. **Composite loader**
   - Add `loadCompositeWindow({ boundaryTuple?: Array<unknown> })` that:
     - Builds a boundary predicate via `tuple-utils`,
     - Calls `requestSnapshot({ orderByPrefix, limit: offset + limit, boundaryPredicate })`,
     - Tracks `biggestRow` (unchanged) with the legacy comparator AND `biggestTuple` for subsequent requests.

3. **Hook into scheduling**
   - Update `subscribeToOrderedChanges` to:
     - Set the index,
     - Trigger `loadCompositeWindow()` for the initial window when `composite` metadata exists,
     - Store a loader callback on the subscription (similar to `loadMoreIfNeeded`) that calls either `loadCompositeWindow` or `requestLimitedSnapshot` based on metadata.

4. **Boundary tracking**
   - In `trackSentValues`, when a composite payload is present, update both `this.biggest` (existing) and `this.biggestTuple` using the encoder.

---

## 5. Snapshot Logic (`packages/db/src/collection/change-events.ts`)

1. **Composite branch**
   - Detect composite payload through updated options (limit + orderByPrefix + tuple helpers).

2. **Candidate gathering**
   - Determine ascent/descent from the first clause’s compare options.
   - Use `index.take` or `index.takeReversed` (depending on direction) to accumulate keys until `>= limit`.
   - Record the last retrieved row’s first-column value as the boundary.
   - Pull additional duplicates at the boundary with `index.lookup('eq', boundaryValue)` filtered through `whereFilter`; dedupe keys already seen.

3. **Sorting & limit**
   - Fetch row values, encode tuples, sort with the shared comparator, and slice to `limit`. Return as change messages (`insert`).

4. **Fallback**
   - When any requirement is missing (no index, missing metadata, no limit), revert to the existing in-memory sort path.

---

## 6. Tuple & Predicate Helpers (`packages/db/src/query/order-by/tuple-utils.ts`)

1. **Tuple encoder**
   - Builds an array: `[col1Value, col2Value, ..., pkValue]`, applying null normalization consistent with `makeComparator`.

2. **Comparator**
   - Uses clause-specific `CompareOptions` (`direction`, `nulls`) for each tuple position.
   - PK comparator inherits the direction/nulls of the final prefix clause to retain deterministic ordering.

3. **Boundary predicate builder**
   - Generates a predicate of the form:
     ```
     c1 > v1 OR
     (c1 = v1 AND c2 > v2) OR
     ... OR
     (c1 = v1 AND ... AND pk > pkVal)
     ```
     flipping operators for DESC and handling null-first/last by expanding conditions (e.g. `(c IS NULL)` checks as needed).

4. **Shared exports**
   - Export helpers for both the compiler and subscriber to avoid duplicate implementations.

---

## 7. Testing Strategy

1. **Unit / integration tests**
   - `currentStateAsChanges` composite path:
     - Ascending with duplicate first-column values,
     - Descending order using `takeReversed`,
     - Boundary tie inclusion verifying limit rows are correct.
   - `CollectionSubscriber`:
     - Ensures only one `_sync.loadSubset` call per window in composite mode,
     - Verifies fallback behavior when metadata or index is missing.
   - Cross-alias ORDER BY (e.g., `[A.col1, A.col2, B.col3]`) confirming prefix truncation and deterministic paging.
   - Null ordering combinations (nulls first/last) to ensure predicate matches comparator semantics.

2. **Regression tests**
   - Keep existing single-column tests to ensure the fast path is untouched.
   - Verify that queries with computed first clause remain in scalar mode.

3. **Manual/diagnostic**
   - Log (debug-level) when composite optimization activates to aid future troubleshooting.

---

## 8. Documentation & Follow-up

1. **Developer docs**
   - Document new `primaryKeyRef` requirement and how to configure it.
   - Describe composite ORDER BY behavior, including PK tie-break and when the optimization activates.

2. **Subset dedupe note**
   - Acknowledge that OR-based predicates may reduce dedupe hits in `DeduplicatedLoadSubset`. Record this as a future optimization opportunity (e.g., predicate normalization).

---

## Work Breakdown

1. `pk-metadata` – Expose/read `primaryKeyRef` in collection config.
2. `tuple-utils` – New shared helpers for tuple encoding/comparison/predicate creation.
3. `compiler-prefix-metadata` – Emit composite payload in `OrderByOptimizationInfo`; guard on metadata.
4. `subscription-api` – Extend `RequestSnapshotOptions` and `currentStateAsChanges` inputs.
5. `subscriber-composite-path` – Composite loader, boundary tracking, loader wiring.
6. `current-state-prefix` – Index-driven candidate gathering + tie inclusion.
7. `tests-composite` – Unit/integration coverage for composite paths and fallbacks.
8. `docs-updates` – Update developer documentation with new metadata requirement and behavior summary.
