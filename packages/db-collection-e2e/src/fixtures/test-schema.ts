import type { User, Post, Comment } from "../types"

/**
 * SQL schema definitions for test tables
 */

export const USERS_TABLE_SCHEMA = `
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  age INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB,
  deleted_at TIMESTAMP
`

export const POSTS_TABLE_SCHEMA = `
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMP,
  deleted_at TIMESTAMP
`

export const COMMENTS_TABLE_SCHEMA = `
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL,
  user_id UUID NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
`

/**
 * Helper to create all test tables
 */
export async function createTestTables(
  dbClient: { query: (sql: string) => Promise<void> },
  tableNames: {
    users: string
    posts: string
    comments: string
  }
): Promise<void> {
  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS ${tableNames.users} (${USERS_TABLE_SCHEMA});
  `)

  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS ${tableNames.posts} (${POSTS_TABLE_SCHEMA});
  `)

  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS ${tableNames.comments} (${COMMENTS_TABLE_SCHEMA});
  `)
}

/**
 * Helper to drop all test tables
 */
export async function dropTestTables(
  dbClient: { query: (sql: string) => Promise<void> },
  tableNames: {
    users: string
    posts: string
    comments: string
  }
): Promise<void> {
  await dbClient.query(`DROP TABLE IF EXISTS ${tableNames.comments}`)
  await dbClient.query(`DROP TABLE IF EXISTS ${tableNames.posts}`)
  await dbClient.query(`DROP TABLE IF EXISTS ${tableNames.users}`)
}

/**
 * Type-safe table column mappings
 */
export const USER_COLUMNS = {
  id: "id",
  name: "name",
  email: "email",
  age: "age",
  isActive: "is_active",
  createdAt: "created_at",
  metadata: "metadata",
  deletedAt: "deleted_at",
} as const

export const POST_COLUMNS = {
  id: "id",
  userId: "user_id",
  title: "title",
  content: "content",
  viewCount: "view_count",
  publishedAt: "published_at",
  deletedAt: "deleted_at",
} as const

export const COMMENT_COLUMNS = {
  id: "id",
  postId: "post_id",
  userId: "user_id",
  text: "text",
  createdAt: "created_at",
  deletedAt: "deleted_at",
} as const
