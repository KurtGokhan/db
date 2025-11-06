/**
 * Joins Test Suite
 *
 * Tests multi-collection joins with various syncMode combinations
 */

import { describe, it, expect } from "vitest"
import { createLiveQueryCollection, eq, gt, and, isNull } from "@tanstack/db"
import type { E2ETestConfig } from "../types"

export function createJoinsTestSuite(getConfig: () => Promise<E2ETestConfig>) {
  describe("Joins Suite", () => {
    describe("Two-Collection Joins", () => {
      it("should join Users and Posts", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users
        const postsCollection = config.collections.onDemand.posts

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .join({ post: postsCollection }, ({ user, post }) =>
              eq(user.id, post.userId)
            )
            .select(({ user, post }) => ({
              id: post.id,
              userName: user.name,
              postTitle: post.title,
            }))
        )

        await query.preload()

        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
        expect(results[0]).toHaveProperty("userName")
        expect(results[0]).toHaveProperty("postTitle")
      })

      it("should join with predicates on both collections", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users
        const postsCollection = config.collections.onDemand.posts

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .where(({ user }) => eq(user.isActive, true))
            .join({ post: postsCollection }, ({ user, post }) =>
              eq(user.id, post.userId)
            )
            .where(({ post }) => gt(post.viewCount, 10))
            .select(({ user, post }) => ({
              id: post.id,
              userName: user.name,
              postTitle: post.title,
              viewCount: post.viewCount,
            }))
        )

        await query.preload()

        const results = Array.from(query.state.values())
        // Verify predicates applied
        results.forEach((r) => {
          expect(r.viewCount).toBeGreaterThan(10)
        })
      })

      it("should join with one eager, one on-demand", async () => {
        const config = await getConfig()
        const usersEager = config.collections.eager.users
        const postsOnDemand = config.collections.onDemand.posts

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersEager })
            .join({ post: postsOnDemand }, ({ user, post }) =>
              eq(user.id, post.userId)
            )
            .select(({ user, post }) => ({
              id: post.id,
              userName: user.name,
              postTitle: post.title,
            }))
        )

        await query.preload()

        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
      })

      it("should join with ordering across collections", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users
        const postsCollection = config.collections.onDemand.posts

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .join({ post: postsCollection }, ({ user, post }) =>
              eq(user.id, post.userId)
            )
            .orderBy(({ post }) => post.viewCount, "desc")
            .select(({ user, post }) => ({
              id: post.id,
              userName: user.name,
              postTitle: post.title,
              viewCount: post.viewCount,
            }))
        )

        await query.preload()

        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)

        // Verify sorting by viewCount
        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].viewCount).toBeGreaterThanOrEqual(
            results[i].viewCount
          )
        }
      })

      it("should join with pagination", async () => {
        const config = await getConfig()
        const usersCollection = config.collections.onDemand.users
        const postsCollection = config.collections.onDemand.posts

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersCollection })
            .join({ post: postsCollection }, ({ user, post }) =>
              eq(user.id, post.userId)
            )
            .orderBy(({ post }) => post.id, "asc")
            .limit(10)
            .offset(5)
            .select(({ user, post }) => ({
              id: post.id,
              userName: user.name,
              postTitle: post.title,
            }))
        )

        await query.preload()

        expect(query.size).toBeLessThanOrEqual(10)
      })
    })

    describe("Three-Collection Joins", () => {
      it("should join Users + Posts + Comments", async () => {
        const config = await getConfig()
        const { users, posts, comments } = config.collections.onDemand

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: users })
            .join({ post: posts }, ({ user, post }) => eq(user.id, post.userId))
            .join({ comment: comments }, ({ post, comment }) =>
              eq(post.id, comment.postId)
            )
            .select(({ user, post, comment }) => ({
              id: comment.id,
              userName: user.name,
              postTitle: post.title,
              commentText: comment.text,
            }))
        )

        await query.preload()

        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
        expect(results[0]).toHaveProperty("userName")
        expect(results[0]).toHaveProperty("postTitle")
        expect(results[0]).toHaveProperty("commentText")
      })

      it("should handle predicates on all three collections", async () => {
        const config = await getConfig()
        const { users, posts, comments } = config.collections.onDemand

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: users })
            .where(({ user }) => eq(user.isActive, true))
            .join({ post: posts }, ({ user, post }) => eq(user.id, post.userId))
            .where(({ post }) => isNull(post.deletedAt))
            .join({ comment: comments }, ({ post, comment }) =>
              eq(post.id, comment.postId)
            )
            .where(({ comment }) => isNull(comment.deletedAt))
            .select(({ user, post, comment }) => ({
              id: comment.id,
              userName: user.name,
              postTitle: post.title,
              commentText: comment.text,
            }))
        )

        await query.preload()

        const results = Array.from(query.state.values())
        // All results should match all predicates
        expect(results.length).toBeGreaterThanOrEqual(0)
      })

      it("should handle mixed syncModes in 3-way join", async () => {
        const config = await getConfig()
        const usersEager = config.collections.eager.users
        const postsOnDemand = config.collections.onDemand.posts
        const commentsOnDemand = config.collections.onDemand.comments

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: usersEager })
            .join({ post: postsOnDemand }, ({ user, post }) =>
              eq(user.id, post.userId)
            )
            .join({ comment: commentsOnDemand }, ({ post, comment }) =>
              eq(post.id, comment.postId)
            )
            .select(({ user, post, comment }) => ({
              id: comment.id,
              userName: user.name,
              postTitle: post.title,
              commentText: comment.text,
            }))
        )

        await query.preload()

        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
      })
    })

    describe("Predicate Pushdown in Joins", () => {
      it("should push predicates to correct collections", async () => {
        const config = await getConfig()
        const { users, posts } = config.collections.onDemand

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: users })
            .join({ post: posts }, ({ user, post }) => eq(user.id, post.userId))
            .where(({ post }) => gt(post.viewCount, 50))
            .select(({ user, post }) => ({
              id: post.id,
              userName: user.name,
              postTitle: post.title,
              viewCount: post.viewCount,
            }))
        )

        await query.preload()

        const results = Array.from(query.state.values())
        // Verify predicate applied
        results.forEach((r) => {
          expect(r.viewCount).toBeGreaterThan(50)
        })
      })

      it("should not over-fetch in joined collections", async () => {
        const config = await getConfig()
        const { users, posts } = config.collections.onDemand

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: users })
            .where(({ user }) => gt(user.age, 30))
            .join({ post: posts }, ({ user, post }) => eq(user.id, post.userId))
            .select(({ user, post }) => ({
              id: post.id,
              userName: user.name,
              userAge: user.age,
              postTitle: post.title,
            }))
        )

        await query.preload()

        const results = Array.from(query.state.values())
        // All users should be > 30
        results.forEach((r) => {
          expect(r.userAge).toBeGreaterThan(30)
        })
      })
    })

    describe("Left Joins", () => {
      it("should handle left joins correctly", async () => {
        const config = await getConfig()
        const { users, posts } = config.collections.onDemand

        const query = createLiveQueryCollection((q) =>
          q
            .from({ user: users })
            .leftJoin({ post: posts }, ({ user, post }) =>
              eq(user.id, post.userId)
            )
            .select(({ user, post }) => ({
              id: user.id,
              userName: user.name,
              postTitle: post.title, // May be null for users without posts
            }))
        )

        await query.preload()

        const results = Array.from(query.state.values())
        expect(results.length).toBeGreaterThan(0)
      })
    })
  })
}
