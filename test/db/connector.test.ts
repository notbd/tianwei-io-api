import { describe, expect, it } from 'vitest'
import { sqlEndpoint } from '@/db/connector'

describe('sqlEndpoint', () => {
  it.each([
    // the content engine's local database, over plain http on the URL's port
    ['127.0.0.1', 5431, 'http://127.0.0.1:5431/sql'],
    ['localhost', 5431, 'http://localhost:5431/sql'],
    // production: the literal address every query goes through
    ['ep-x.us-east-2.aws.neon.tech', 5432, 'https://api.us-east-2.aws.neon.tech/sql'],
    // only the exact names are local
    ['localhost.evil.example', 5431, 'https://api.evil.example/sql'],
    ['localhost.', 5431, 'https://api./sql'],
  ])('sends the queries for %s:%s to %s', (host, port, endpoint) => {
    expect(sqlEndpoint(host, port)).toBe(endpoint)
  })
})
