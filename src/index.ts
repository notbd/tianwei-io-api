import { createApp } from '@/app'

/**
 * Cloudflare Workers entry point.
 * A Hono app doubles as the Worker's `fetch` export handler.
 */
export default createApp()
