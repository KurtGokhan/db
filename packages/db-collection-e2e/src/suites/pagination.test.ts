/**
 * Pagination Test Suite
 * 
 * Tests ordering, limits, offsets, and window management
 */

import { describe, it, expect } from 'vitest'
import { createLiveQueryCollection, eq, gt, isNull } from '@tanstack/db'
import type { E2ETestConfig } from '../types'
import { assertSorted, assertCollectionSize } from '../utils/assertions'

export function createPaginationTestSuite(getConfig: () => Promise<E2ETestConfig>) {
  describe('Pagination Suite', () => {
    describe('OrderBy', () => {
      it('should sort ascending by single field', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.age, 'asc')
        )

        await query.preload()
        
        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
        assertSorted(results, 'age', 'asc')
      })

      it('should sort descending by single field', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.age, 'desc')
        )

        await query.preload()
        
        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
        assertSorted(results, 'age', 'desc')
      })

      it('should sort by string field', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.name, 'asc')
        )

        await query.preload()
        
        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
        assertSorted(results, 'name', 'asc')
      })

      it('should sort by date field', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.createdAt, 'desc')
        )

        await query.preload()
        
        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
        assertSorted(results, 'createdAt', 'desc')
      })

      it('should sort by multiple fields', async () => {
        const config = await getConfig()
        const postsCollection = config.collections.onDemand.posts

        const query = createLiveQueryCollection((q) =>
          q
            .from({ post: postsCollection })
            .orderBy(({ post }) => [post.userId, post.viewCount])
        )

        await query.preload()
        
        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
        
        // Verify multi-field sort (userId first, then viewCount within each userId)
        for (let i = 1; i < results.length; i++) {
          const prev = results[i - 1]
          const curr = results[i]
          
          // If userId is same, viewCount should be ascending
          if (prev.userId === curr.userId) {
            expect(prev.viewCount).toBeLessThanOrEqual(curr.viewCount)
          }
        }
      })
    })

    describe('Limit', () => {
      it('should limit to specific number of records', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .limit(10)
        )

        await query.preload()
        
        assertCollectionSize(query, 10)
      })

      it('should handle limit=0', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .limit(0)
        )

        await query.preload()
        
        assertCollectionSize(query, 0)
      })

      it('should handle limit larger than dataset', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .limit(1000)
        )

        await query.preload()
        
        // Should return all records (100 from seed data)
        expect(query.size).toBeLessThanOrEqual(100)
      })

      it('should combine limit with orderBy', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.age, 'asc')
            .limit(5)
        )

        await query.preload()
        
        assertCollectionSize(query, 5)
        const results = Array.from(query.state.values())
        assertSorted(results, 'age', 'asc')
      })
    })

    describe('Offset', () => {
      it('should skip records with offset', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.id, 'asc')
            .offset(20)
        )

        await query.preload()
        
        const results = Array.from(query.state.values())
        expect(results.length).toBe(80) // 100 - 20 = 80
      })

      it('should combine offset with limit (pagination)', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.id, 'asc')
            .limit(10)
            .offset(20)
        )

        await query.preload()
        
        assertCollectionSize(query, 10)
      })

      it('should handle offset beyond dataset', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .offset(200)
        )

        await query.preload()
        
        assertCollectionSize(query, 0)
      })
    })

    describe('Complex Pagination Scenarios', () => {
      it('should paginate with predicates', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => eq(user.isActive, true))
            .orderBy(({ user }) => user.age, 'asc')
            .limit(10)
            .offset(5)
        )

        await query.preload()
        
        const results = Array.from(query.state.values())
        expect(results.length).toBeLessThanOrEqual(10)
        assertAllItemsMatch(query, (u) => u.isActive === true)
        assertSorted(results, 'age', 'asc')
      })

      it('should handle pagination edge cases - last page with fewer records', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.id, 'asc')
            .limit(10)
            .offset(95) // Last 5 records
        )

        await query.preload()
        
        expect(query.size).toBeLessThanOrEqual(10)
        expect(query.size).toBeGreaterThan(0)
      })

      it('should handle single record pages', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.id, 'asc')
            .limit(1)
            .offset(0)
        )

        await query.preload()
        
        assertCollectionSize(query, 1)
      })
    })

    describe('Performance Verification', () => {
      it('should only load requested page (not entire dataset)', async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .orderBy(({ user }) => user.id, 'asc')
            .limit(10)
            .offset(20)
        )

        await query.preload()
        
        // Verify we got exactly 10 records
        assertCollectionSize(query, 10)
        
        // In on-demand mode, the underlying collection should ideally only load
        // the requested page, not all 100 records
        // (This depends on Electric's predicate pushdown implementation)
      })
    })
  })
}
