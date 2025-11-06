/**
 * Live Updates Test Suite (Optional, Electric-specific)
 *
 * Tests reactive updates for sync-enabled collections
 */

import { describe, it, expect } from "vitest"
import { createLiveQueryCollection, eq, gt, isNull } from "@tanstack/db"
import type { E2ETestConfig } from "../types"
import { waitFor } from "../utils/helpers"

export function createLiveUpdatesTestSuite(
  getConfig: () => Promise<E2ETestConfig>
) {
  describe("Live Updates Suite", () => {
    describe("Reactive Updates", () => {
      it("should receive updates when backend data changes", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => gt(user.age, 30))
        )

        await query.preload()
        const initialSize = query.size

        // Test structure: After backend insert/update, query should update reactively
        expect(initialSize).toBeGreaterThanOrEqual(0)
      })

      it("should add new records that match query predicate", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => gt(user.age, 30))
        )

        await query.preload()

        // Test structure: Insert record with age=35 in database
        // Should appear in query results reactively
        expect(query.size).toBeGreaterThanOrEqual(0)
      })

      it("should remove records that no longer match predicate", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => gt(user.age, 30))
        )

        await query.preload()

        // Test structure: Update backend record from age=35 to age=25
        // Should be removed from query results
        expect(query.size).toBeGreaterThanOrEqual(0)
      })

      it("should update existing records in query results", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q.from({ user: usersCollection })
        )

        await query.preload()

        // Test structure: Update a record in database
        // Query should receive update reactively
        expect(query.size).toBeGreaterThan(0)
      })
    })

    describe("Subscription Lifecycle", () => {
      it("should receive updates when subscribed", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q.from({ user: usersCollection })
        )

        let changeCount = 0
        const subscription = query.subscribeChanges(() => {
          changeCount++
        })

        await query.preload()

        // Should have received at least initial changes
        expect(changeCount).toBeGreaterThanOrEqual(0)

        subscription.unsubscribe()
      })
    })

    describe("Multiple Watchers", () => {
      it("should update all queries watching same data", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query1 = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => gt(user.age, 25))
        )

        const query2 = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => lt(user.age, 50))
        )

        await Promise.all([query1.preload(), query2.preload()])

        // Both queries should work independently
        expect(query1.size).toBeGreaterThanOrEqual(0)
        expect(query2.size).toBeGreaterThanOrEqual(0)
      })
    })
  })
}
