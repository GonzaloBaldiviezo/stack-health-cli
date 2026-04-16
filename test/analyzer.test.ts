import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer.js';

const tempDirs: string[] = [];

function makeProject(): string {
  const projectPath = mkdtempSync(resolve(tmpdir(), 'stack-health-cli-'));
  tempDirs.push(projectPath);
  return projectPath;
}

afterEach(() => {
  for (const projectPath of tempDirs.splice(0)) {
    rmSync(projectPath, { recursive: true, force: true });
  }
});

describe('analyzeProject', () => {
  it('returns zero score for empty directory', () => {
    const projectPath = makeProject();
    const results = analyzeProject(projectPath);
    const score = results.reduce((sum, result) => sum + (result.passed ? result.points : 0), 0);

    expect(results).toHaveLength(6);
    expect(score).toBe(0);
  });

  it('detects common healthy signals for a Node project', () => {
    const projectPath = makeProject();

    mkdirSync(resolve(projectPath, '.git'));
    mkdirSync(resolve(projectPath, '.github/workflows'), { recursive: true });
    writeFileSync(resolve(projectPath, 'README.md'), '# Demo\n');
    writeFileSync(
      resolve(projectPath, 'package.json'),
      JSON.stringify(
        {
          name: 'demo',
          scripts: {
            test: 'vitest run',
            lint: 'eslint .',
            typecheck: 'tsc --noEmit'
          }
        },
        null,
        2
      )
    );

    const results = analyzeProject(projectPath);
    const score = results.reduce((sum, result) => sum + (result.passed ? result.points : 0), 0);

    expect(score).toBe(100);
    expect(results.every((result) => result.passed)).toBe(true);
  });

  it('accepts detected test files when no test script exists', () => {
    const projectPath = makeProject();

    writeFileSync(
      resolve(projectPath, 'package.json'),
      JSON.stringify(
        {
          name: 'demo',
          scripts: {}
        },
        null,
        2
      )
    );
    mkdirSync(resolve(projectPath, 'src'), { recursive: true });
    writeFileSync(resolve(projectPath, 'src/example.test.ts'), 'export {};\n');

    const results = analyzeProject(projectPath);
    const automatedChecks = results.find((result) => result.label === 'Automated checks');

    expect(automatedChecks?.passed).toBe(true);
  });
});
