import type { Collection } from '@tanstack/db'

/**
 * Test data schema types
 */
export interface User {
  id: string // UUID
  name: string // For collation testing
  email: string | null
  age: number
  isActive: boolean
  createdAt: Date
  metadata: Record<string, unknown> | null // JSON field
  deletedAt: Date | null // Soft delete
}

export interface Post {
  id: string
  userId: string // FK to User
  title: string
  content: string | null
  viewCount: number
  publishedAt: Date | null
  deletedAt: Date | null
}

export interface Comment {
  id: string
  postId: string // FK to Post
  userId: string // FK to User
  text: string
  createdAt: Date
  deletedAt: Date | null
}

/**
 * Seed data result
 */
export interface SeedDataResult {
  users: User[]
  posts: Post[]
  comments: Comment[]
  userIds: string[]
  postIds: string[]
  commentIds: string[]
}

/**
 * Test configuration for e2e tests
 */
export interface E2ETestConfig {
  collections: {
    eager: {
      users: Collection<User>
      posts: Collection<Post>
      comments: Collection<Comment>
    }
    onDemand: {
      users: Collection<User>
      posts: Collection<Post>
      comments: Collection<Comment>
    }
  }

  // Lifecycle hooks
  setup: () => Promise<void>
  teardown: () => Promise<void>
  beforeEach?: () => Promise<void>
  afterEach?: () => Promise<void>
}

/**
 * Database client interface (pg Client)
 */
export interface DbClient {
  connect(): Promise<void>
  end(): Promise<void>
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>
}

