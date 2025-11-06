# Child Collections

Child collections enable hierarchical data structures by allowing you to nest queries within select clauses. This creates a parent-child relationship where each parent row has its own child collection that stays in sync with the parent.

## Basic Usage

```typescript
import { createCollection, Query } from "@tanstack/db"

const users = createCollection({
  id: "users",
  getKey: (user) => user.id,
  sync: { sync: () => {} },
})

const posts = createCollection({
  id: "posts",
  getKey: (post) => post.id,
  sync: { sync: () => {} },
})

const comments = createCollection({
  id: "comments",
  getKey: (comment) => comment.id,
  sync: { sync: () => {} },
})

// Create a query with nested child collections
const usersWithPosts = new Query().from({ user: users }).select(({ user }) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  posts: new Query()
    .from({ post: posts })
    .where(({ post }) => eq(post.userId, user.id))
    .orderBy(({ post }) => post.createdAt, "desc")
    .limit(5)
    .select(({ post }) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      comments: new Query()
        .from({ comment: comments })
        .where(({ comment }) => eq(comment.postId, post.id))
        .select(({ comment }) => ({
          id: comment.id,
          text: comment.text,
          author: comment.author,
        })),
    })),
}))
```

## Using Child Collections in React

```tsx
import { useLiveQuery } from "@tanstack/react-db"

function UserList() {
  const { data: users } = useLiveQuery(usersWithPosts)

  return (
    <div>
      {users?.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  )
}

function UserCard({ user }: { user: any }) {
  // Access the child collection for this user's posts
  const { data: posts } = useLiveQuery(user.posts)

  return (
    <div className="user-card">
      <h2>{user.name}</h2>
      <p>{user.email}</p>

      <div className="posts">
        <h3>Recent Posts</h3>
        {posts?.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  )
}

function PostCard({ post }: { post: any }) {
  // Access the nested child collection for this post's comments
  const { data: comments } = useLiveQuery(post.comments)

  return (
    <div className="post-card">
      <h4>{post.title}</h4>
      <p>{post.content}</p>

      <div className="comments">
        <h5>Comments</h5>
        {comments?.map((comment) => (
          <div key={comment.id} className="comment">
            <strong>{comment.author}:</strong> {comment.text}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Key Features

### Automatic Join Key Discovery

Child collections automatically discover the relationship between parent and child data by looking for equality conditions in the child query's WHERE clause:

```typescript
// This automatically creates a join on user.id = post.userId
posts: new Query()
  .from({ post: posts })
  .where(({ post }) => eq(post.userId, user.id)) // <- Join key discovered here
  .select(({ post }) => ({ ... }))
```

### Per-Parent Ordering and Limits

Each child collection maintains its own ordering and limits, applied per parent row:

```typescript
posts: new Query()
  .from({ post: posts })
  .where(({ post }) => eq(post.userId, user.id))
  .orderBy(({ post }) => post.createdAt, 'desc')
  .limit(5) // Each user gets their top 5 posts
  .select(({ post }) => ({ ... }))
```

### Full Query Feature Support

Child collections support all query features including:

- **Joins**: Additional tables can be joined within child queries
- **Aggregates**: Group by and aggregate functions work in child queries
- **Complex WHERE clauses**: Multiple conditions, AND/OR logic, etc.

```typescript
posts: new Query()
  .from({ post: posts })
  .join({ category: categories }, ({ post, category }) =>
    eq(post.categoryId, category.id)
  )
  .where(({ post }) => eq(post.userId, user.id))
  .where(({ post }) => eq(post.status, "published"))
  .groupBy(({ post, category }) => category.name)
  .select(({ post, category, count }) => ({
    category: category.name,
    postCount: count(post.id),
    latestPost: post.title,
  }))
```

## Type Safety

Child collections are fully type-safe and integrate with TypeScript:

```typescript
type UserWithPosts = GetResult<typeof usersWithPosts>
// UserWithPosts['posts'] is inferred as ChildCollection<PostType>

// In React components
const { data: users } = useLiveQuery(usersWithPosts)
// users is typed as UserWithPosts[]
```

## Performance Considerations

### Lazy Loading

Child collections are created lazily - they only exist when a parent row is accessed:

```typescript
// Child collections are created on-demand
const { data: users } = useLiveQuery(usersWithPosts)
// No child collections created yet

const { data: posts } = useLiveQuery(users[0].posts)
// Child collection for first user is now created
```

### Memory Management

Child collections are automatically cleaned up when their parent rows are deleted from the parent collection. This ensures no memory leaks as the parent-child relationship is maintained.

### Query Optimization

Child queries benefit from the same optimizations as regular queries:

- Predicate pushdown
- Index usage
- Cached compilation
- Lazy collection loading

## Error Handling

### Missing Join Keys

If a child query doesn't have a proper join condition, an error is thrown:

```typescript
// ❌ This will throw MissingJoinKeyError
posts: new Query()
  .from({ post: posts })
  .select(({ post }) => ({ ... })) // No WHERE clause with parent reference
```

### Invalid Join Expressions

Only simple equality conditions between parent and child references are supported:

```typescript
// ✅ Valid
.where(({ post }) => eq(post.userId, user.id))

// ❌ Invalid - complex expressions not supported
.where(({ post }) => eq(post.userId, add(user.id, 1)))
```

### V1 Limitations

**Composite Join Keys Not Supported**

The initial version only supports single-field join keys. If you need to join on multiple fields, you'll get a `CompositeJoinKeyError`:

```typescript
// ❌ Not supported in V1
posts: new Query()
  .from({ post: posts })
  .where(({ post }) => and(
    eq(post.userId, user.id),
    eq(post.tenantId, user.tenantId)
  ))
  .select(({ post }) => ({ ... }))
// Error: CompositeJoinKeyError - multiple join keys found

// ✅ Workaround: Use a single computed join key
// In your data model, create a composite key field:
// post.userTenantKey = `${userId}_${tenantId}`
// user.tenantKey = `${id}_${tenantId}`
posts: new Query()
  .from({ post: posts })
  .where(({ post }) => eq(post.userTenantKey, user.tenantKey))
  .select(({ post }) => ({ ... }))
```

**Child Collections Cannot Be Used in Expressions**

Child collections can only be passed through in select clauses. You cannot use them in WHERE, HAVING, or aggregate expressions:

```typescript
// ❌ Runtime error - ChildCollectionAccessError
.where(({ user }) => user.posts.length > 0)
.having(({ user }) => count(user.posts.id) > 5)

// ✅ Correct - use joins or subqueries for filtering
.join({ post: posts }, ({ user, post }) => eq(post.userId, user.id))
.where(({ post }) => isNotNull(post.id))
```

**Future Features**

These features are planned but not yet available:

- `asArray()` / `asMap()` operators to embed child data in parent rows
- Composite join keys (multiple field joins)
- Computed filters based on child collection properties

---

## Implementation Details

The `includes` are compiled into a parallel branch in the query graph, that is joined to the parent to filter it by the parent. The output of the parallel branch is then fanned out to child collections on each parent colleciton row.

Child collections are a normal collection but with the sync write API exposed on the `collection.utils` object.

```typescript
let syncMethods: SyncMethods<User>
const collection = createCollection({
  id: 'users',
  getKey: (user) => user.id,
  sync: { sync: (params) => {
    syncMethods = params
  } }
  utils: {
    _sync: syncMethods
  }
})

collection.utils._sync.begin()
collection.utils._sync.write({ type: 'insert', value: { id: '1', name: 'John' } })
collection.utils._sync.commit()
```

Inside `CollectionConfigBuilder` we keep a Map of key => ChildCollection, which is maintained as such:

- when the parent collection row is created, we create a new ChildCollection and add it to the map if it doesn't exist
- when the parent collection row is deleted, we delete the ChildCollection from the map
- when a message arrives for the child collection:
- if it is an insert or update, we retrieve the ChildCollection from the map and write the message to it
- if it is a delete, we retrieve the ChildCollection and _if it exists_ we write a delete message to it. If it doesn't exist, we ignore the message.

orderBy+limit in these parallel branches are compiled using the new `groupByKey` options, so that each parent row gets its own independent window of results.

### Restrictions

The results of a child collection **cannot** be used in the parent collection's query.

```typescript
const postsWithComments = new Query()
  .from({ post: posts })
  .select(({ post, comment }) => ({
    ...post,
    comments: new Query()
      .from({ comment: comments })
      .where(({ comment }) => eq(comment.postId, post.id))
      .select(({ comment }) => ({
        id: comment.id,
        text: comment.text,
        author: comment.author,
      })),
  }))

const postsWithAtLeastOneComment = new Query()
  .from({ post: postsWithComments })
  .where(({ post }) => post.comments.length > 0) // ❌ This will throw an error
  .select(({ post }) => ({ ...post }))
```

`comments` is a child collection and so it's results are not available inside the query. This needs to be enforced at the type level, as well as validated at runtime.

---

## Additional features to add:

`asArray` and `asMap` operators to convert the child collection to an array or map. When used the parent collection is updated directly from the child collection.

```typescript
const postsWithComments = new Query()
  .from({ post: posts })
  .select(({ post, comment }) => ({
    ...post,
    tags: asArray(new Query()
      .from({ tag: tags })
      .where(({ tag }) => eq(tag.postId, post.id))
      .select(({ tag }) => ({
        id: tag.id,
        name: tag.name
      }))
  }))
```

The user doesn't not then need to call `useLiveQuery` on the child collection, they can just use the array or map directly.

It will still internally keep the ChildCollection to maintain this state, but when it changes it will call `update` on the parent collection. This is perfect for things like like lists of tags on a post which is much shorter, rather than comments which can be much longer and likely rendered by a different component.
