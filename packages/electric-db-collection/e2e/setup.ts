/**
 * Electric E2E Test Setup
 * 
 * Provides configuration and helpers for Electric collection e2e tests
 */

import { createCollection } from '@tanstack/db'
import { electricCollectionOptions } from '../src/electric'
import type { E2ETestConfig, User, Post, Comment } from '../../db-collection-e2e/src/types'
import type { Collection } from '@tanstack/db'

const ELECTRIC_URL = process.env.ELECTRIC_URL ?? 'http://localhost:3000'

/**
 * Map database column names to TypeScript property names
 */
function mapDbToJs<T extends Record<string, any>>(dbRow: any): T {
  return {
    id: dbRow.id,
    name: dbRow.name,
    email: dbRow.email,
    age: dbRow.age,
    isActive: dbRow.is_active,
    createdAt: dbRow.created_at,
    metadata: dbRow.metadata,
    deletedAt: dbRow.deleted_at,
    // Post fields
    userId: dbRow.user_id,
    title: dbRow.title,
    content: dbRow.content,
    viewCount: dbRow.view_count,
    publishedAt: dbRow.published_at,
    // Comment fields
    postId: dbRow.post_id,
    text: dbRow.text,
  } as T
}

/**
 * Create Electric collection configuration for e2e tests
 */
export async function createElectricE2EConfig(options: {
  schema: string
  usersTable: string
  postsTable: string
  commentsTable: string
  baseUrl?: string
}): Promise<E2ETestConfig> {
  const { schema, usersTable, postsTable, commentsTable, baseUrl = ELECTRIC_URL } = options

  const seedData = generateSeedData()

  // Create eager mode collections (sync entire dataset)
  const eagerUsers = createCollection(
    electricCollectionOptions({
      id: `electric-e2e-users-eager-${Date.now()}`,
      shapeOptions: {
        url: `${baseUrl}/v1/shape`,
        params: {
          table: `${schema}.${usersTable}`,
        },
      },
      syncMode: 'eager',
      getKey: (item: User) => item.id,
      startSync: false, // Start manually in tests
    })
  ) as Collection<User>

  const eagerPosts = createCollection(
    electricCollectionOptions({
      id: `electric-e2e-posts-eager-${Date.now()}`,
      shapeOptions: {
        url: `${baseUrl}/v1/shape`,
        params: {
          table: `${schema}.${postsTable}`,
        },
      },
      syncMode: 'eager',
      getKey: (item: Post) => item.id,
      startSync: false,
    })
  ) as Collection<Post>

  const eagerComments = createCollection(
    electricCollectionOptions({
      id: `electric-e2e-comments-eager-${Date.now()}`,
      shapeOptions: {
        url: `${baseUrl}/v1/shape`,
        params: {
          table: `${schema}.${commentsTable}`,
        },
      },
      syncMode: 'eager',
      getKey: (item: Comment) => item.id,
      startSync: false,
    })
  ) as Collection<Comment>

  // Create on-demand mode collections (load subsets as needed)
  const onDemandUsers = createCollection(
    electricCollectionOptions({
      id: `electric-e2e-users-ondemand-${Date.now()}`,
      shapeOptions: {
        url: `${baseUrl}/v1/shape`,
        params: {
          table: `${schema}.${usersTable}`,
        },
      },
      syncMode: 'on-demand',
      getKey: (item: User) => item.id,
      startSync: false,
    })
  ) as Collection<User>

  const onDemandPosts = createCollection(
    electricCollectionOptions({
      id: `electric-e2e-posts-ondemand-${Date.now()}`,
      shapeOptions: {
        url: `${baseUrl}/v1/shape`,
        params: {
          table: `${schema}.${postsTable}`,
        },
      },
      syncMode: 'on-demand',
      getKey: (item: Post) => item.id,
      startSync: false,
    })
  ) as Collection<Post>

  const onDemandComments = createCollection(
    electricCollectionOptions({
      id: `electric-e2e-comments-ondemand-${Date.now()}`,
      shapeOptions: {
        url: `${baseUrl}/v1/shape`,
        params: {
          table: `${schema}.${commentsTable}`,
        },
      },
      syncMode: 'on-demand',
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
      // Setup hook if needed
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
    },
  }
}

