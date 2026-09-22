#!/usr/bin/env node
/**
 * 🛰️ Agent-readiness check for the published site.
 *
 * The public scan at isitagentready.com reads the discovery documents, the
 * Markdown negotiation, `/mcp`, `/a2a`, the WebMCP tools, and `robots.txt`, and
 * reports a level plus one status per check. Recording that result by hand in a
 * commit message let a regression land unnoticed, so this script runs the same
 * scan and fails on any result the repository does not expect.
 *
 * Usage: pnpm scan:agents [url]        (default https://pingclair.aqeo.dev)
 *
 * Exit codes: 0 the site is at the required level with only the documented
 * failures, 1 a check regressed or the level dropped, 2 the scan itself could
 * not be reached.
 */

const SITE = process.argv[2] ?? 'https://pingclair.aqeo.dev';
const ENDPOINT = 'https://isitagentready.com/api/scan';
const REQUIRED_LEVEL = 5;

/**
 * Checks that are expected to fail, and why. Publishing what they ask for would
 * be worse than failing them, so they are not "fixed" from here.
 */
const EXPECTED_FAILURES = new Map([
	['discovery.oauthDiscovery', 'no OAuth authorization server is operated for this site'],
	['discovery.oauthProtectedResource', 'nothing on this site is a protected resource'],
	['discovery.authMd', 'auth.md is self-contained because there is no authorization server to point at'],
	['discoverability.dnsAid', 'follows the aqeo.dev DNSSEC state, which the maintainer sets outside this repository'],
]);

const response = await fetch(ENDPOINT, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ url: SITE }),
}).catch((error) => {
	console.error(`✗ could not reach ${ENDPOINT}: ${error.message}`);
	process.exit(2);
});

if (!response.ok) {
	console.error(`✗ ${ENDPOINT} answered ${response.status}`);
	process.exit(2);
}

const report = await response.json();
const checks = Object.entries(report.checks ?? {}).flatMap(([category, entries]) =>
	Object.entries(entries ?? {}).map(([name, check]) => ({
		id: `${category}.${name}`,
		status: check.status,
		message: check.message,
	})),
);

const failures = checks.filter((check) => check.status === 'fail');
const unexpected = failures.filter((check) => !EXPECTED_FAILURES.has(check.id));
const expected = failures.filter((check) => EXPECTED_FAILURES.has(check.id));
const passed = checks.filter((check) => check.status === 'pass');

console.log(`site:  ${SITE}`);
console.log(`level: ${report.level} — ${report.levelName} (required: ${REQUIRED_LEVEL})\n`);
console.log(`pass:   ${passed.length}`);
console.log(`failed: ${failures.length} (${expected.length} documented, ${unexpected.length} unexpected)\n`);

for (const check of passed) console.log(`✅ ${check.id}`);
for (const check of expected) console.log(`⏭️  ${check.id} — expected: ${EXPECTED_FAILURES.get(check.id)}`);
for (const check of unexpected) console.log(`❌ ${check.id} — ${check.message}`);

if (unexpected.length) {
	console.error(`\n✗ ${unexpected.length} unexpected failing check(s)`);
	process.exit(1);
}

if (report.level < REQUIRED_LEVEL) {
	console.error(`\n✗ level dropped to ${report.level}; ${REQUIRED_LEVEL} is the published level`);
	process.exit(1);
}

console.log(`\n✅ level ${report.level} with only the documented failures`);
