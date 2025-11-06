/**
 * Query Collection E2E Test Setup
 * 
 * Provides mock backend and configuration for Query collection e2e tests
 */

import { createCollection } from '@tanstack/db'
import { QueryClient } from '@tanstack/query-core'
import { queryCollectionOptions } from '../src/query'
import type { E2ETestConfig, User, Post, Comment, SeedDataResult } from '../../db-collection-e2e/src/types'
import { sortBy, filterBy, paginate } from '../../db-collection-e2e/src/utils/helpers'
import type { Collection } from '@tanstack/db'
import { vi } from 'vitest'

/**
 * Mock backend for Query collection testing
 */
export class MockQueryBackend {
  private users: Map<string, User>
  private posts: Map<string, Post>
  private comments: Map<string, Comment>

  constructor(seedData: SeedDataResult) {
    this.users = new Map(seedData.users.map((u) => [u.id, u]))
    this.posts = new Map(seedData.posts.map((p) => [p.id, p]))
    this.comments = new Map(seedData.comments.map((c) => [c.id, c]))
  }

  // Mock fetch functions that simulate backend queries
  fetchUsers = vi.fn(async () => {
    return Array.from(this.users.values())
  })

  fetchPosts = vi.fn(async () => {
    return Array.from(this.posts.values())
  })

  fetchComments = vi.fn(async () => {
    return Array.from(this.comments.values())
  })

  // Reset call counts for testing deduplication
  resetMocks() {
    this.fetchUsers.mockClear()
    this.fetchPosts.mockClear()
    this.fetchComments.mockClear()
  }

  getData() {
    return {
      users: Array.from(this.users.values()),
      posts: Array.from(this.posts.values()),
      comments: Array.from(this.comments.values()),
    }
  }
}

/**
 * Create Query collection configuration for e2e tests
 */
export async function createQueryE2EConfig(options: {
  mockBackend: MockQueryBackend
}): Promise<E2ETestConfig> {
  const { mockBackend } = options

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        retry: false,
      },
    },
  })

  // Create eager mode collections (load all data immediately)
  const eagerUsers = createCollection(
    queryCollectionOptions({
      id: `query-e2e-users-eager-${Date.now()}`,
      queryClient,
      queryKey: ['e2e', 'users', 'eager'],
      queryFn: mockBackend.fetchUsers,
      getKey: (item: User) => item.id,
      startSync: true,
    })
  ) as Collection<User>

  const eagerPosts = createCollection(
    queryCollectionOptions({
      id: `query-e2e-posts-eager-${Date.now()}`,
      queryClient,
      queryKey: ['e2e', 'posts', 'eager'],
      queryFn: mockBackend.fetchPosts,
      getKey: (item: Post) => item.id,
      startSync: true,
    })
  ) as Collection<Post>

  const eagerComments = createCollection(
    queryCollectionOptions({
      id: `query-e2e-comments-eager-${Date.now()}`,
      queryClient,
      queryKey: ['e2e', 'comments', 'eager'],
      queryFn: mockBackend.fetchComments,
      getKey: (item: Comment) => item.id,
      startSync: true,
    })
  ) as Collection<Comment>

  // Create on-demand mode collections
  // Note: Query collections work differently - they don't have true on-demand mode
  // They refetch all data each time. For test purposes, we'll use the same setup.
  const onDemandUsers = createCollection(
    queryCollectionOptions({
      id: `query-e2e-users-ondemand-${Date.now()}`,
      queryClient,
      queryKey: ['e2e', 'users', 'ondemand'],
      queryFn: mockBackend.fetchUsers,
      getKey: (item: User) => item.id,
      startSync: false, // Don't start immediately for on-demand
    })
  ) as Collection<User>

  const onDemandPosts = createCollection(
    queryCollectionOptions({
      id: `query-e2e-posts-ondemand-${Date.now()}`,
      queryClient,
      queryKey: ['e2e', 'posts', 'ondemand'],
      queryFn: mockBackend.fetchPosts,
      getKey: (item: Post) => item.id,
      startSync: false,
    })
  ) as Collection<Post>

  const onDemandComments = createCollection(
    queryCollectionOptions({
      id: `query-e2e-comments-ondemand-${Date.now()}`,
      queryClient,
      queryKey: ['e2e', 'comments', 'ondemand'],
      queryFn: mockBackend.fetchComments,
      getKey: (item: Comment) => item.id,
      startSync: false,
    })
  ) as Collection<Comment>

  return {
    collections: {
      eager: {
        users: eagerUsers,
        posts: eagerPosts,
        comments: eagerComments,
      },
      onDemand: {
        users: onDemandUsers,
        posts: onDemandPosts,
        comments: onDemandComments,
      },
    },
    setup: async () => {
      mockBackend.resetMocks()
    },
    teardown: async () => {
      // Cleanup collections
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
}
