/**
 * API Endpoint Test Script
 *
 * Tests all API endpoints for correct responses, error handling, and CORS.
 *
 * Prerequisites:
 *   - Database running (local Docker or remote)
 *   - API server running: pnpm dev
 *
 * Usage:
 *   pnpm test:endpoints
 *
 * Environment:
 *   API_URL - Override the default API URL (default: http://localhost:3001)
 */
import process from 'node:process';
const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const results = [];
function log(name, passed, message) {
    results.push({ name, passed, message });
    const icon = passed ? '[PASS]' : '[FAIL]';
    console.info(`${icon} ${name}: ${message}`);
}
async function testEndpoint(name, path, expectedStatus, validate) {
    try {
        const res = await fetch(`${BASE_URL}${path}`);
        const body = await res.json();
        if (res.status !== expectedStatus) {
            log(name, false, `Expected status ${expectedStatus}, got ${res.status}`);
            return;
        }
        if (validate && !validate(body)) {
            log(name, false, `Response validation failed: ${JSON.stringify(body)}`);
            return;
        }
        log(name, true, `Status ${res.status}`);
    }
    catch (err) {
        log(name, false, `Request failed: ${err}`);
    }
}
async function testTextEndpoint(name, path, expectedStatus, expectedText) {
    try {
        const res = await fetch(`${BASE_URL}${path}`);
        const body = await res.text();
        if (res.status !== expectedStatus) {
            log(name, false, `Expected status ${expectedStatus}, got ${res.status}`);
            return;
        }
        if (expectedText && body !== expectedText) {
            log(name, false, `Expected "${expectedText}", got "${body}"`);
            return;
        }
        log(name, true, `Status ${res.status}`);
    }
    catch (err) {
        log(name, false, `Request failed: ${err}`);
    }
}
async function testCors(name, path, origin) {
    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            method: 'OPTIONS',
            headers: {
                'Origin': origin,
                'Access-Control-Request-Method': 'GET',
            },
        });
        const allowedOrigin = res.headers.get('Access-Control-Allow-Origin');
        if (allowedOrigin === origin) {
            log(name, true, `CORS allowed for ${origin}`);
        }
        else if (allowedOrigin === null) {
            log(name, false, `CORS not configured (no Access-Control-Allow-Origin header)`);
        }
        else {
            log(name, false, `CORS mismatch. Expected: ${origin}, Got: ${allowedOrigin}`);
        }
    }
    catch (err) {
        log(name, false, `CORS check failed: ${err}`);
    }
}
function isSuccessResponse(body) {
    return (typeof body === 'object'
        && body !== null
        && 'status' in body
        && body.status === 'success');
}
function isErrorResponse(body) {
    return (typeof body === 'object'
        && body !== null
        && 'status' in body
        && body.status === 'error');
}
function hasArrayData(body) {
    return (isSuccessResponse(body)
        && 'data' in body
        && Array.isArray(body.data));
}
async function runTests() {
    console.info('='.repeat(60));
    console.info('API Endpoint Tests');
    console.info(`Target: ${BASE_URL}`);
    console.info('='.repeat(60));
    console.info('');
    // -------------------------------------------------------------------------
    // Basic Endpoints
    // -------------------------------------------------------------------------
    console.info('--- Basic Endpoints ---');
    await testTextEndpoint('GET /', '/', 200, 'Hello from tianwei.io API!');
    await testEndpoint('GET /health', '/health', 200, (body) => {
        return (typeof body === 'object'
            && body !== null
            && 'status' in body
            && body.status === 'ok');
    });
    // -------------------------------------------------------------------------
    // API Endpoints
    // -------------------------------------------------------------------------
    console.info('\n--- API Endpoints ---');
    await testEndpoint('GET /api/posts', '/api/posts', 200, (body) => {
        return isSuccessResponse(body) && hasArrayData(body);
    });
    await testEndpoint('GET /api/categories', '/api/categories', 200, (body) => {
        return isSuccessResponse(body) && hasArrayData(body);
    });
    // -------------------------------------------------------------------------
    // Post Slug Validation
    // -------------------------------------------------------------------------
    console.info('\n--- Slug Validation ---');
    await testEndpoint('GET /api/post/:slug (valid format, may 404)', '/api/post/test-post', 404, isErrorResponse);
    await testEndpoint('GET /api/post/:slug (invalid: uppercase)', '/api/post/Test-Post', 400, isErrorResponse);
    await testEndpoint('GET /api/post/:slug (invalid: special chars)', '/api/post/test_post!', 400, isErrorResponse);
    await testEndpoint('GET /api/post/:slug (invalid: consecutive hyphens)', '/api/post/test--post', 400, isErrorResponse);
    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------
    console.info('\n--- Error Handling ---');
    await testEndpoint('GET /nonexistent (404)', '/nonexistent', 404, isErrorResponse);
    // -------------------------------------------------------------------------
    // CORS (informational - depends on server configuration)
    // -------------------------------------------------------------------------
    console.info('\n--- CORS (may fail if ALLOWED_ORIGINS is empty) ---');
    await testCors('CORS: localhost:3000', '/api/posts', 'http://localhost:3000');
    await testCors('CORS: tianwei.io', '/api/posts', 'https://tianwei.io');
    await testCors('CORS: www.tianwei.io', '/api/posts', 'https://www.tianwei.io');
    // -------------------------------------------------------------------------
    // Dev Endpoints (only available in development mode)
    // -------------------------------------------------------------------------
    console.info('\n--- Dev Endpoints (development mode only) ---');
    await testEndpoint('GET /api/__dev/posts', '/api/__dev/posts', 200, body => isSuccessResponse(body) && hasArrayData(body));
    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.info(`\n${'='.repeat(60)}`);
    console.info('Summary');
    console.info('='.repeat(60));
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    console.info(`${passed}/${total} tests passed`);
    if (passed < total) {
        console.info('\nFailed tests:');
        results
            .filter(r => !r.passed)
            .forEach(r => console.info(`  - ${r.name}: ${r.message}`));
        // Don't exit with error for CORS failures (may be intentionally disabled)
        const nonCorsFailures = results.filter(r => !r.passed && !r.name.startsWith('CORS'));
        if (nonCorsFailures.length > 0) {
            process.exit(1);
        }
    }
}
runTests();
