import { describe, expect, it } from 'vitest';
import { parseJestJson, parseJUnitXml } from '../src/test-execution.js';

describe('parseJUnitXml', () => {
  it('parses a testsuites summary when testsuite tags are absent', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="10" failures="2" errors="1" skipped="3" time="1.25"></testsuites>`;

    const summary = parseJUnitXml(xml);

    expect(summary).toEqual({
      total: 10,
      failed: 3,
      skipped: 3,
      durationMs: 1250
    });
  });

  it('aggregates multiple testsuite tags', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="a" tests="4" failures="1" errors="0" skipped="1" time="0.4"></testsuite>
  <testsuite name="b" tests="6" failures="0" errors="1" skipped="2" time="0.6"></testsuite>
</testsuites>`;

    const summary = parseJUnitXml(xml);

    expect(summary).toEqual({
      total: 10,
      failed: 2,
      skipped: 3,
      durationMs: 1000
    });
  });

  it('returns null for non-JUnit content', () => {
    const summary = parseJUnitXml('<root></root>');
    expect(summary).toBeNull();
  });
});

describe('parseJestJson', () => {
  it('parses basic totals from jest JSON output', () => {
    const json = JSON.stringify({
      numTotalTests: 12,
      numPassedTests: 9,
      numFailedTests: 2,
      numPendingTests: 1
    });

    const summary = parseJestJson(json);

    expect(summary).toEqual({
      total: 12,
      failed: 2,
      skipped: 1,
      durationMs: null
    });
  });

  it('returns null for invalid JSON', () => {
    const summary = parseJestJson('not json');
    expect(summary).toBeNull();
  });
});
