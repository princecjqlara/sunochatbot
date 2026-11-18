import assert from 'node:assert/strict';

const baseArg = process.argv.find(arg => arg.startsWith('--base='));
const base = new URL(baseArg?.slice('--base='.length) || 'http://127.0.0.1:3100');
assert.ok(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password);
assert.equal(base.pathname, '/');
const results = [];

async function check(path, expected, verify = () => {}, headers = {}) {
    const response = await fetch(new URL(path, base), { redirect: 'manual', headers, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, expected, path);
    await verify(await response.text());
    results.push({ path, status: response.status });
}

// Only anonymous reads: never invoke a worker with credentials or submit a form.
if (process.argv.includes('--expect-hidden')) {
    await check('/ui-preview', 404);
} else {
    await check('/', 200, html => {
        assert.ok(html.includes('Setup is in progress'));
        assert.ok(html.includes('href="/ui-preview"'));
        assert.ok(!html.includes('<form'));
    });
    await check('/ui-preview', 200, html => {
        for (const text of ['Workspace UI preview', 'Sample data only.', 'Sample Suno team A']) assert.ok(html.includes(text), text);
        assert.match(html, /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/);
    });
    await check('/ui-preview?page=%2Fdashboard%2Fcontacts', 200, html => {
        assert.match(html, /<h1[^>]*>Contacts &amp; bulk tools<\/h1>/);
        assert.ok(html.includes('Sample client A') && html.includes('Birthday song'));
    });
    await check('/ui-preview?page=%2Fdashboard%2Fworkspace%3Fview%3Dsalary', 200, html => {
        assert.match(html, /<h1[^>]*>Salary<\/h1>/);
        assert.ok(html.includes('Live tools for this section will be available when Suno setup is complete.'));
    });
    await check('/ui-preview?page=http%3A%2F%2F%5B', 200, html => assert.match(html, /<h1[^>]*>Teams dashboard<\/h1>/));
    for (const path of ['/api/workspace', '/api/pages']) {
        await check(path, 503, body => assert.equal(JSON.parse(body).code, 'SUNO_SETUP_PENDING'));
    }
    await check('/api/auth/session', 200, body => assert.ok(!JSON.parse(body).user));
    await check('/api/cron/workspace', 401);
    await check('/api/cron/workspace', 401, undefined, { 'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware' });
    await check('/api/test-facebook', 404);
}
console.log(JSON.stringify({
    base: base.origin,
    verification_scope: 'setup_preview_and_anonymous_access_controls_only',
    live_feature_parity_verified: false,
    sample_data_only: true,
    passed: true,
    checks: results.length,
    results
}, null, 2));
