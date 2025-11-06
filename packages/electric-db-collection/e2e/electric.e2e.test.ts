/**
 * Electric Collection E2E Tests
 * 
 * REAL end-to-end tests using actual Postgres + Electric sync
 */

import { describe, beforeAll, afterAll } from 'vitest'
import { inject } from 'vitest'
import { createCollection } from '@tanstack/db'
import { electricCollectionOptions } from '../src/electric'
import { makePgClient } from '../../db-collection-e2e/support/global-setup'
import { generateSeedData } from '../../db-collection-e2e/src/index'
import type { E2ETestConfig, User, Post, Comment } from '../../db-collection-e2e/src/types'
import type { Client } from 'pg'
import {
  createPredicatesTestSuite,
  createPaginationTestSuite,
  createJoinsTestSuite,
  createDeduplicationTestSuite,
  createCollationTestSuite,
  createMutationsTestSuite,
  createLiveUpdatesTestSuite,
  createRegressionTestSuite,
} from '../../db-collection-e2e/src/index'

describe('Electric Collection E2E Tests', () => {
  let config: E2ETestConfig
  let dbClient: Client
  let usersTable: string
  let postsTable: string
  let commentsTable: string

  beforeAll(async () => {
    const baseUrl = inject('baseUrl')
    const testSchema = inject('testSchema')
    const seedData = generateSeedData()

    // Create unique table names (quoted for Electric)
    const testId = Date.now().toString(16)
    usersTable = `"users_e2e_${testId}"`
    postsTable = `"posts_e2e_${testId}"`
    commentsTable = `"comments_e2e_${testId}"`

    // Connect to database
    dbClient = makePgClient({ options: `-csearch_path=${testSchema}` })
    await dbClient.connect()
    await dbClient.query(`SET search_path TO ${testSchema}`)

    // Create tables
    await dbClient.query(`
      CREATE TABLE ${usersTable} (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        age INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        metadata JSONB,
        deleted_at TIMESTAMP
      )
    `)

    await dbClient.query(`
      CREATE TABLE ${postsTable} (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        view_count INTEGER NOT NULL DEFAULT 0,
        published_at TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `)

    await dbClient.query(`
      CREATE TABLE ${commentsTable} (
        id UUID PRIMARY KEY,
        post_id UUID NOT NULL,
        user_id UUID NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP
      )
    `)

    // Insert seed data
    for (const user of seedData.users) {
      await dbClient.query(
        `INSERT INTO ${usersTable} (id, name, email, age, is_active, created_at, metadata, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.id,
          user.name,
          user.email,
          user.age,
          user.isActive,
          user.createdAt,
          user.metadata ? JSON.stringify(user.metadata) : null,
          user.deletedAt,
        ]
      )
    }

    for (const post of seedData.posts) {
      await dbClient.query(
        `INSERT INTO ${postsTable} (id, user_id, title, content, view_count, published_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          post.id,
          post.userId,
          post.title,
          post.content,
          post.viewCount,
          post.publishedAt,
          post.deletedAt,
        ]
      )
    }

    for (const comment of seedData.comments) {
      await dbClient.query(
        `INSERT INTO ${commentsTable} (id, post_id, user_id, text, created_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          comment.id,
          comment.postId,
          comment.userId,
          comment.text,
          comment.createdAt,
          comment.deletedAt,
        ]
      )
    }

    // Create REAL Electric collections
    const eagerUsers = createCollection(
      electricCollectionOptions({
        id: `electric-e2e-users-eager-${testId}`,
        shapeOptions: {
          url: `${baseUrl}/v1/shape`,
          params: {
            table: `${testSchema}.${usersTable}`,
          },
        },
        syncMode: 'eager',
        getKey: (item: any) => item.id,
        startSync: true,
      })
    )

    const eagerPosts = createCollection(
      electricCollectionOptions({
        id: `electric-e2e-posts-eager-${testId}`,
        shapeOptions: {
          url: `${baseUrl}/v1/shape`,
          params: {
            table: `${testSchema}.${postsTable}`,
          },
        },
        syncMode: 'eager',
        getKey: (item: any) => item.id,
        startSync: true,
      })
    )

    const eagerComments = createCollection(
      electricCollectionOptions({
        id: `electric-e2e-comments-eager-${testId}`,
        shapeOptions: {
          url: `${baseUrl}/v1/shape`,
          params: {
            table: `${testSchema}.${commentsTable}`,
          },
        },
        syncMode: 'eager',
        getKey: (item: any) => item.id,
        startSync: true,
      })
    )

    const onDemandUsers = createCollection(
      electricCollectionOptions({
        id: `electric-e2e-users-ondemand-${testId}`,
        shapeOptions: {
          url: `${baseUrl}/v1/shape`,
          params: {
            table: `${testSchema}.${usersTable}`,
          },
        },
        syncMode: 'on-demand',
        getKey: (item: any) => item.id,
        startSync: true,
      })
    )

    const onDemandPosts = createCollection(
      electricCollectionOptions({
        id: `electric-e2e-posts-ondemand-${testId}`,
        shapeOptions: {
          url: `${baseUrl}/v1/shape`,
          params: {
            table: `${testSchema}.${postsTable}`,
          },
        },
        syncMode: 'on-demand',
        getKey: (item: any) => item.id,
        startSync: true,
      })
    )

    const onDemandComments = createCollection(
      electricCollectionOptions({
        id: `electric-e2e-comments-ondemand-${testId}`,
        shapeOptions: {
          url: `${baseUrl}/v1/shape`,
          params: {
            table: `${testSchema}.${commentsTable}`,
          },
        },
        syncMode: 'on-demand',
        getKey: (item: any) => item.id,
        startSync: true,
      })
    )

    // Wait for eager collections to sync all data
    await eagerUsers.preload()
    await eagerPosts.preload()
    await eagerComments.preload()

    // Wait for on-demand collections to be ready (they start empty)
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
      },
    }
  }, 60000) // 60 second timeout for setup

  afterAll(async () => {
    if (config) {
      await config.teardown()
    }

    // Drop tables
    if (dbClient) {
      try {
        await dbClient.query(`DROP TABLE IF EXISTS ${commentsTable}`)
        await dbClient.query(`DROP TABLE IF EXISTS ${postsTable}`)
        await dbClient.query(`DROP TABLE IF EXISTS ${usersTable}`)
      } catch (e) {
        console.error('Error dropping tables:', e)
      }
      await dbClient.end()
    }
  })

  // Helper to get config
  async function getConfig() {
    return config
  }

  // Run all test suites
  createPredicatesTestSuite(getConfig)
  createPaginationTestSuite(getConfig)
  createJoinsTestSuite(getConfig)
  createDeduplicationTestSuite(getConfig)
  createCollationTestSuite(getConfig)
  createMutationsTestSuite(getConfig)
  createLiveUpdatesTestSuite(getConfig)
  createRegressionTestSuite(getConfig)
})
