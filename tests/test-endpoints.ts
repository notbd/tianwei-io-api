/**
 * Manual API endpoint test script.
 * Run with: pnpm tsx test/endpoints.ts
 *
 * Prerequisites:
 * - Local Postgres container running (from tianwei-io-content)
 * - API server running: pnpm run dev
 */
import process from 'node:process'

const BASE_URL = 'http://localhost:3001'

interface TestResult {
  name: string
  passed: boolean
  message: string
}

const results: TestResult[] = []

function log(name: string, passed: boolean, message: string) {
  results.push({ name, passed, message })
  const icon = passed ? '[PASS]' : '[FAIL]'
  console.info(`${icon} ${name}: ${message}`)
}

async function testEndpoint(
  name: string,
  path: string,
  expectedStatus: number,
  validate?: (body: unknown) => boolean,
) {
  try {
    const res = await fetch(`${BASE_URL}${path}`)
    const body = await res.json()

    if (res.status !== expectedStatus) {
      log(name, false, `Expected status ${expectedStatus}, got ${res.status}`)
      return
    }

    if (validate && !validate(body)) {
      log(name, false, `Response validation failed: ${JSON.stringify(body)}`)
      return
    }

    log(name, true, `Status ${res.status}`)
  }
  catch (err) {
    log(name, false, `Request failed: ${err}`)
  }
}

async function testTextEndpoint(
  name: string,
  path: string,
  expectedStatus: number,
  expectedText?: string,
) {
  try {
    const res = await fetch(`${BASE_URL}${path}`)
    const body = await res.text()

    if (res.status !== expectedStatus) {
      log(name, false, `Expected status ${expectedStatus}, got ${res.status}`)
      return
    }

    if (expectedText && body !== expectedText) {
      log(name, false, `Expected "${expectedText}", got "${body}"`)
      return
    }

    log(name, true, `Status ${res.status}`)
  }
  catch (err) {
    log(name, false, `Request failed: ${err}`)
  }
}

function isSuccessResponse(body: unknown): body is { status: string } {
  return (
    typeof body === 'object'
    && body !== null
    && 'status' in body
    && (body as { status: string }).status === 'success'
  )
}

function isErrorResponse(body: unknown): body is { status: string } {
  return (
    typeof body === 'object'
    && body !== null
    && 'status' in body
    && (body as { status: string }).status === 'error'
  )
}

function hasArrayData(body: unknown): boolean {
  return (
    isSuccessResponse(body)
    && 'data' in body
    && Array.isArray((body as { data: unknown }).data)
  )
}

async function runTests() {
  console.info('Starting API endpoint tests...\n')

  // Root endpoint (returns text, not JSON)
  await testTextEndpoint(
    'GET /',
    '/',
    200,
    'Hello from tianwei.io API!',
  )

  // Posts list endpoint
  await testEndpoint('GET /api/posts', '/api/posts', 200, (body) => {
    return isSuccessResponse(body) && hasArrayData(body)
  })

  // Categories endpoint
  await testEndpoint('GET /api/categories', '/api/categories', 200, (body) => {
    return isSuccessResponse(body) && hasArrayData(body)
  })

  // Single post - valid slug format (may return 404 if post doesn't exist)
  await testEndpoint(
    'GET /api/post/:slug (valid format)',
    '/api/post/test-post',
    404,
    isErrorResponse,
  )

  // Single post - invalid slug (uppercase)
  await testEndpoint(
    'GET /api/post/:slug (invalid: uppercase)',
    '/api/post/Test-Post',
    400,
    isErrorResponse,
  )

  // Single post - invalid slug (special chars)
  await testEndpoint(
    'GET /api/post/:slug (invalid: special chars)',
    '/api/post/test_post!',
    400,
    isErrorResponse,
  )

  // Single post - invalid slug (consecutive hyphens)
  await testEndpoint(
    'GET /api/post/:slug (invalid: consecutive hyphens)',
    '/api/post/test--post',
    400,
    isErrorResponse,
  )

  // Not found route
  await testEndpoint(
    'GET /nonexistent (404)',
    '/nonexistent',
    404,
    isErrorResponse,
  )

  // Dev endpoint (only if server is running in dev mode)
  await testEndpoint(
    'GET /api/__dev/posts (dev only)',
    '/api/__dev/posts',
    200,
    body => isSuccessResponse(body) && hasArrayData(body),
  )

  // Summary
  console.info('\n--- Summary ---')
  const passed = results.filter(r => r.passed).length
  const total = results.length
  console.info(`${passed}/${total} tests passed`)

  if (passed < total) {
    process.exit(1)
  }
}

runTests()
