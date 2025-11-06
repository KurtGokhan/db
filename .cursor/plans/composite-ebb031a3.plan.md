<!-- ebb031a3-a65e-49c2-ae82-c2b4194a514c 98edba78-9d94-441c-bad4-a052b8b3167f -->
# Composite ORDER BY Windows with Compiler Metadata

## Scope overview

Upgrade ORDER BY optimization so composite prefixes on the first alias can page deterministically with a PK tie-break and single pushdown when required metadata is available, while preserving existing scalar/dual-pushdown paths as fallbacks.

## Updated design details

### Primary-key metadata and fallbacks

- Introduce optional collection metadata (e.g. `collection.config.primaryKeyRef` or similar) that exposes the PK as a resolvable `PropRef` path. This is opt-in; existing collections without the metadata continue using the current dual-pushdown strategy.
- The compiler/subscriber only activate composite PK tie-break behavior when this metadata exists and the prefix clauses are resolvable refs on the same alias. Otherwise, retain existing scalar optimization including the two pushdowns (min-value equality + greater-than) to ensure duplicates are still fetched.

### Compiler (`packages/db/src/query/compiler/order-by.ts` + types)

- Preserve the current fractional-index comparator (`valueExtractor`, `compare`) for downstream operators.
- When metadata qualifies, build composite prefix info `{ prefixClauses, pkRef, tupleExtractor, tupleComparator, tupleEncoder }`; otherwise leave `OrderByOptimizationInfo` unchanged.
- Always call `setOrderByIndex` on the subscription irrespective of composite mode so live updates remain filtered by the index.

### Snapshot API (`packages/db/src/collection/subscription.ts`)

- Extend `requestSnapshot` options with optional `{ orderByPrefix?: Array<OrderByClause>, limit?: number, boundaryPredicate?: BasicExpression }`. Defaults are all `undefined`, ensuring existing callers behave identically.
- Composite callers build the lexicographic predicate (using shared helpers) and pass it via `where`. `_sync.loadSubset` still receives `{ where, orderBy, limit }` only.

### CollectionSubscriber (`packages/db/src/query/live/collection-subscriber.ts`)

- In `subscribeToOrderedChanges`, after `setOrderByIndex(index)`, branch:
- **Composite mode** (metadata present): invoke new `loadCompositeWindow({ boundaryTuple? })` that computes the predicate, calls `requestSnapshot` with the optional fields, and updates both `biggestRow` (for downstream comparator) and `biggestTuple` (for next window boundary).
- **Fallback mode**: retain existing `requestLimitedSnapshot` flow.
- Update `loadMoreIfNeeded` to delegate to `loadCompositeWindow` when metadata exists; otherwise reuse `loadNextItems`.

### currentStateAsChanges (`packages/db/src/collection/change-events.ts`)

- Composite path algorithm with direction awareness:

1. Determine ascending/descending from the first prefix clause.
2. Use `index.take` (asc) or `index.takeReversed` (desc) to accumulate keys while count < limit.
3. Track the last key’s first-column value as `boundaryValue`.
4. Retrieve duplicates for `boundaryValue` via `index.lookup('eq', boundaryValue)` (filter with `whereFilter` + dedupe) and merge, ensuring we don’t double-count keys already collected.
5. Build tuples using shared encoder, sort by tuple comparator, and select top `limit` change messages.

- If metadata/index absent, fall back to current in-memory behavior and, when duplicates exist, accept the existing dual-pushdown path.

### Tuple + predicate helpers (`packages/db/src/query/order-by/tuple-utils.ts`)

- Provide shared tuple encoder/comparator respecting per-clause `CompareOptions` (direction & null ordering) plus PK tie-break when available.
- Provide lexicographic predicate builder emitting OR-of-AND expressions aligned with the comparator; handle mixed ASC/DESC and null ordering.

### Fallback & safety notes

- Composite optimization requires: resolvable prefix, opt-in primaryKeyRef metadata, limit present, and accessible first-column index. Otherwise, system reuses current scalar path (including dual pushdowns for duplicates).
- Existing callers of `requestSnapshot`/`_sync.loadSubset` behave unchanged when new options are omitted.

### Tests

- Tests covering composite opt-in behavior, fallback without metadata, duplicates with asc/desc scans, mixed direction/null ordering, cross-alias truncation, single pushdown when metadata available, and unchanged scalar flow otherwise.

## Todo breakdown

- `pk-metadata`: add optional collection PK ref metadata and detection logic.
- `compiler-prefix-metadata`: emit composite payload with fallbacks and ensure `setOrderByIndex` always runs.
- `tuple-utils`: shared tuple encoder/comparator/predicate builder with direction/null handling.
- `subscription-api`: add optional fields to `requestSnapshot` while keeping default behavior.
- `subscriber-composite-path`: implement composite loader + updated `loadMoreIfNeeded` while preserving fallback.
- `current-state-prefix`: implement index iteration, boundary duplicate handling, and direction-aware merging.
- `tests-composite`: expand test suite for both composite and fallback scenarios.
- `notes-dedupe`: document dedupe implications and metadata opt-in requirements.