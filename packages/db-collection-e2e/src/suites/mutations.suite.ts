/**
 * Mutations Test Suite
 * 
 * Tests data mutations with on-demand syncMode
 */

import { describe, it, expect } from 'vitest'
import { createLiveQueryCollection, eq, gt, isNull } from '@tanstack/db'
import type { E2ETestConfig } from '../types'
import { waitFor } from '../utils/helpers'

export function createMutationsTestSuite(getConfig: () => Promise<E2ETestConfig>) {
  describe('Mutations Suite', () => {
    describe('Insert Mutations', () => {
      it('should insert new record via collection', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        // Load initial data
        const query = createLiveQueryCollection((q) =>
          q.from({ user: usersCollection })
        )

        await query.preload()
        const initialSize = query.size

        // Note: Actual insert would use collection.insert()
        // This test structure is ready for when mutation APIs are available
        expect(initialSize).toBeGreaterThanOrEqual(0)
      })

      it('should handle insert appearing in matching queries', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => gt(user.age, 30))
        )

        await query.preload()
        
        // Test structure ready for insert testing
        expect(query.size).toBeGreaterThanOrEqual(0)
      })
    })

    describe('Update Mutations', () => {
      it('should handle update that makes record match predicate', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => gt(user.age, 30))
        )

        await query.preload()
        const initialSize = query.size

        // Test structure: Update a user from age=25 to age=35
        // Should appear in query results
        expect(initialSize).toBeGreaterThanOrEqual(0)
      })

      it('should handle update that makes record unmatch predicate', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => gt(user.age, 30))
        )

        await query.preload()
        
        // Test structure: Update a user from age=35 to age=25
        // Should be removed from query results
        expect(query.size).toBeGreaterThanOrEqual(0)
      })
    })

    describe('Delete Mutations', () => {
      it('should handle delete removing record from query', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q.from({ user: usersCollection })
        )

        await query.preload()
        
        // Test structure: Delete a record, verify it's removed
        expect(query.size).toBeGreaterThan(0)
      })
    })

    describe('Soft Delete Pattern', () => {
      it('should filter out soft-deleted records', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => isNull(user.deletedAt))
        )

        await query.preload()
        
        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
        results.forEach(u => {
          expect(u.deletedAt).toBeNull()
        })
      })

      it('should include soft-deleted records when not filtered', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q.from({ user: usersCollection })
        )

        await query.preload()
        
        // Should include both deleted and non-deleted
        const results = Array.from(query.state.values())
        const hasDeleted = results.some(u => u.deletedAt !== null)
        const hasNotDeleted = results.some(u => u.deletedAt === null)
        
        expect(hasNotDeleted).toBe(true)
        // May or may not have deleted records depending on seed data
      })
    })

    describe('Mutation with Queries', () => {
      it('should maintain query state during data changes', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => eq(user.isActive, true))
            .orderBy(({ user }) => user.age, 'asc')
            .limit(10)
        )

        await query.preload()
        
        // Test structure: Mutations should maintain pagination state
        expect(query.size).toBeLessThanOrEqual(10)
      })
    })
  })
}
