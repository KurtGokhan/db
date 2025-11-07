---
"@tanstack/db-ivm": patch
---

Fix Uint8Array hashing to enable proper equality comparisons for binary IDs like ULIDs.

Small Uint8Arrays (≤128 bytes) are now hashed by their content rather than by reference, allowing the `eq` expression function to correctly compare binary identifiers. Large arrays (>128 bytes) continue to be hashed by reference to avoid performance costs.

This fixes an issue where users with binary ULID identifiers (16 bytes) couldn't use the `eq` function for ID comparisons and were forced to use the less efficient functional expression variant.
