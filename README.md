<!-- markdownlint-disable MD007 MD033 MD041 -->
<samp>
<h1>tianwei-io-api</h1>

REST API service for tianwei.io built with Hono.

This repository serves as the API layer for my personal website [tianwei.io](https://tianwei.io).

<h2>Features</h2>

- **Type-Safe API**: Full TypeScript with Zod runtime validation for requests and responses
- **Rate Limiting**: IP-based throttling in prod to prevent abuse
- **CORS Support**: Configurable cross-origin resource sharing for frontend integration
- **Health Checks**: Standard `/health` endpoint for deployment monitoring
- **Graceful Shutdown**: Proper signal handling with database connection cleanup
- **Dev Mode**: Environment-aware endpoints for local testing and debugging

<h2>Stack</h2>

- **Framework**: [Hono](https://hono.dev)
- **Runtime**: [Node.js](https://nodejs.org/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team)
- **Validation**: [Zod](https://zod.dev)
- **Deployment**: [Fly.io](https://fly.io)

<h2>Endpoints</h2>

- `GET /` - Root endpoint (returns greeting)
- `GET /health` - Health check endpoint
- `GET /api/posts` - List all published posts
- `GET /api/categories` - List all categories
- `GET /api/post/:slug` - Get a single post by slug
- `GET /api/__dev/posts` - Dev-only endpoint (includes unpublished posts)

All API endpoints return JSON responses with a consistent structure:

- Success: `{ status: "success", data: ... }`
- Error: `{ status: "error", message: ... }`

<h2>Local Run</h2>

```shell
git clone git@github.com:notbd/tianwei-io-api.git
cd tianwei-io-api
pnpm install

# Set up a `.env.local` file according to the instructions in `.env.example`
# Start local dev server with pnpm
pnpm run dev
```

<h2>Testing</h2>

The project includes several test scripts:

```shell
# Validate env loader and local DB connectivity
pnpm run test:env-db

# Validate remote (production) DB connectivity and posts table
pnpm run test:remote-db

# Validate API behavior (requires server + DB running)
pnpm run test:endpoints
```

These tests cover:

- Env loading and local DB connection (including a simple `SELECT 1`)
- Remote DB connection and `posts` table visibility
- API responses for basic routes, data endpoints, slug validation, 404 handling, and CORS

<h2>Environment Configuration</h2>

The API supports both local and production environments:

- **Local**: Reads from `.env.local`, connects to local Docker Postgres by default (configurable)
- **Production**: Uses environment variables from Fly.io, always connects to remote DB instance

Connection behavior:

- Local dev can connect to either local or remote database for testing
- Production deployment always connects to remote database
- CORS is configurable via `ALLOWED_ORIGINS` environment variable
- Rate limiting (100 requests per IP per hour) is enabled in prod

<h2>License</h2>

Source code is licensed under <a href='./LICENSE'>AGPLv3</a>.
</samp>
