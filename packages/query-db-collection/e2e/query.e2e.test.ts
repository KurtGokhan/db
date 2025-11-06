/**
 * Query Collection E2E Tests
 *
 * Tests using REAL Query collections with mock backend
 */

import { afterAll, beforeAll, describe } from "vitest"
import { createCollection } from "@tanstack/db"
import { QueryClient } from "@tanstack/query-core"
import { queryCollectionOptions } from "../src/query"
import {
  createCollationTestSuite,
  createDeduplicationTestSuite,
  createJoinsTestSuite,
  createMutationsTestSuite,
  createPaginationTestSuite,
  createPredicatesTestSuite,
  createRegressionTestSuite,
  generateSeedData,
} from "../../db-collection-e2e/src/index"
import type { E2ETestConfig } from "../../db-collection-e2e/src/types"

describe(`Query Collection E2E Tests`, () => {
  let config: E2ETestConfig
  let queryClient: QueryClient

  beforeAll(async () => {
    const seedData = generateSeedData()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 0,
          retry: false,
        },
      },
    })

    // Create REAL Query collections with mock backend queryFn
    const eagerUsers = createCollection(
      queryCollectionOptions({
        id: `query-e2e-users-eager`,
        queryClient,
        queryKey: [`e2e`, `users`, `eager`],
        queryFn: async () => {
          // Mock query function that returns seed data
          return seedData.users
        },
        getKey: (item: User) => item.id,
        startSync: true,
      })
    )

    const eagerPosts = createCollection(
      queryCollectionOptions({
        id: `query-e2e-posts-eager`,
        queryClient,
        queryKey: [`e2e`, `posts`, `eager`],
        queryFn: async () => {
          return seedData.posts
        },
        getKey: (item: Post) => item.id,
        startSync: true,
      })
    )

    const eagerComments = createCollection(
      queryCollectionOptions({
        id: `query-e2e-comments-eager`,
        queryClient,
        queryKey: [`e2e`, `comments`, `eager`],
        queryFn: async () => {
          return seedData.comments
        },
        getKey: (item: Comment) => item.id,
        startSync: true,
      })
    )

    const onDemandUsers = createCollection(
      queryCollectionOptions({
        id: `query-e2e-users-ondemand`,
        queryClient,
        queryKey: [`e2e`, `users`, `ondemand`],
        queryFn: async () => {
          return seedData.users
        },
        getKey: (item: User) => item.id,
        startSync: false,
      })
    )

    const onDemandPosts = createCollection(
      queryCollectionOptions({
        id: `query-e2e-posts-ondemand`,
        queryClient,
        queryKey: [`e2e`, `posts`, `ondemand`],
        queryFn: async () => {
          return seedData.posts
        },
        getKey: (item: Post) => item.id,
        startSync: false,
      })
    )

    const onDemandComments = createCollection(
      queryCollectionOptions({
        id: `query-e2e-comments-ondemand`,
        queryClient,
        queryKey: [`e2e`, `comments`, `ondemand`],
        queryFn: async () => {
          return seedData.comments
        },
        getKey: (item: Comment) => item.id,
        startSync: false,
      })
    )

    // Wait for eager collections to load
    await eagerUsers.preload()
    await eagerPosts.preload()
    await eagerComments.preload()

    // On-demand collections don't start automatically
    await onDemandUsers.preload()
    await onDemandPosts.preload()
    await onDemandComments.preload()

    config = {
      collections: {
        eager: {
          users: eagerUsers as any,
          posts: eagerPosts as any,
          comments: eagerComments as any,
        },
        onDemand: {
          users: onDemandUsers as any,
          posts: onDemandPosts as any,
          comments: onDemandComments as any,
        },
      },
      setup: async () => {},
      teardown: async () => {
        await Promise.all([
          eagerUsers.cleanup(),
          eagerPosts.cleanup(),
          eagerComments.cleanup(),
          onDemandUsers.cleanup(),
          onDemandPosts.cleanup(),
          onDemandComments.cleanup(),
        ])
        queryClient.clear()
      },
    }
  })

  afterAll(async () => {
    await config.teardown()
  })

  async function getConfig() {
    return config
  }

  // Run all test suites (except Live Updates which is Electric-specific)
  createPredicatesTestSuite(getConfig)
  createPaginationTestSuite(getConfig)
  createJoinsTestSuite(getConfig)
  createDeduplicationTestSuite(getConfig)
  createCollationTestSuite(getConfig)
  createMutationsTestSuite(getConfig)
  createRegressionTestSuite(getConfig)
})
