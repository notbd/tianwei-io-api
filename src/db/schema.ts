import {
  boolean,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * Posts table schema:
 * Stores metadata, body content, and publishing state for each .mdx entry.
 */
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 200 }).notNull().unique(),
  category: varchar('category', { length: 100 }).notNull(),

  title: text('title').notNull(),
  description: text('description'),
  author: varchar('author', { length: 100 }).notNull(),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),

  // whether this entry should be visible to the frontend
  isPublished: boolean('is_published').default(false),

  content: text('content'),
})
