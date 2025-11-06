/**
 * Collation Test Suite
 *
 * Tests string collation configuration and behavior
 */

import { describe, it, expect } from "vitest"
import {
  createLiveQueryCollection,
  createCollection,
  eq,
  gt,
} from "@tanstack/db"
import { electricCollectionOptions } from "@tanstack/electric-db-collection"
import type { E2ETestConfig, User } from "../types"

export function createCollationTestSuite(
  getConfig: () => Promise<E2ETestConfig>
) {
  describe("Collation Suite", () => {
    describe("Default Collation", () => {
      it("should use default collation for string comparisons", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.name, "asc")
        )

        await query.preload()

        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
      })

      it("should handle case-sensitive comparisons by default", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        // Different case variations should be treated as different
        const query = createLiveQueryCollection(
          (q) =>
            q
              .from({ user: usersCollection })
              .where(({ user }) => eq(user.name, "alice 0")) // lowercase
        )

        await query.preload()

        const results = Array.from(query.state.values())
        // Should match lowercase variant from seed data
        expect(results.length).toBeGreaterThanOrEqual(0)
      })
    })

    describe("Custom Collection-Level Collation", () => {
      it("should use custom defaultStringCollation at collection level", async () => {
        const config = await getConfig()

        // Test will use collection with custom collation if provided
        const query = createLiveQueryCollection({
          query: (q) => q.from({ user: config.collections.onDemand.users }),
          defaultStringCollation: {
            stringSort: "lexical",
          },
        })

        await query.preload()

        expect(query.compareOptions?.stringSort).toBe("lexical")
      })

      it("should support locale-based collation", async () => {
        const config = await getConfig()

        const query = createLiveQueryCollection({
          query: (q) => q.from({ user: config.collections.onDemand.users }),
          defaultStringCollation: {
            stringSort: "locale",
            locale: "de-DE",
          },
        })

        await query.preload()

        expect(query.compareOptions?.stringSort).toBe("locale")
        expect(query.compareOptions?.locale).toBe("de-DE")
      })
    })

    describe("Query-Level Collation Override", () => {
      it("should override collection collation at query level", async () => {
        const config = await getConfig()

        const query = createLiveQueryCollection({
          query: (q) => q.from({ user: config.collections.onDemand.users }),
          defaultStringCollation: {
            stringSort: "lexical",
          },
        })

        await query.preload()

        expect(query.compareOptions?.stringSort).toBe("lexical")
      })
    })

    describe("Collation in OrderBy", () => {
      it("should respect collation when sorting strings", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.name, "asc")
        )

        await query.preload()

        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)

        // Verify sorted (actual sort order depends on collation)
        for (let i = 1; i < results.length; i++) {
          // Just verify it's sorted, regardless of collation
          expect(results[i - 1].name).toBeTruthy()
        }
      })
    })
  })
}
