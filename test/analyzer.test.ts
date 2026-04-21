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

  it('marks automated checks as failed when neither test script nor test files exist', () => {
    const projectPath = makeProject();

    writeFileSync(
      resolve(projectPath, 'package.json'),
      JSON.stringify({ name: 'demo' }, null, 2)
    );

    const results = analyzeProject(projectPath);
    const automatedChecks = results.find((result) => result.label === 'Automated checks');

    expect(automatedChecks?.passed).toBe(false);
    expect(automatedChecks?.recommendation).toBe('Add at least one automated test or a test script.');
  });

  it('handles project with only lint script (no test script)', () => {
    const projectPath = makeProject();

    writeFileSync(
      resolve(projectPath, 'package.json'),
      JSON.stringify(
        {
          name: 'demo',
          scripts: {
            lint: 'eslint .'
          }
        },
        null,
        2
      )
    );

    const results = analyzeProject(projectPath);
    const automatedChecks = results.find((result) => result.label === 'Automated checks');
    const codeQuality = results.find((result) => result.label === 'Code quality scripts');

    expect(automatedChecks?.passed).toBe(false);
    expect(codeQuality?.passed).toBe(true);
  });

  it('handles project with only typecheck script (no test or lint script)', () => {
    const projectPath = makeProject();

    writeFileSync(
      resolve(projectPath, 'package.json'),
      JSON.stringify(
        {
          name: 'demo',
          scripts: {
            typecheck: 'tsc --noEmit'
          }
        },
        null,
        2
      )
    );

    const results = analyzeProject(projectPath);
    const automatedChecks = results.find((result) => result.label === 'Automated checks');
    const codeQuality = results.find((result) => result.label === 'Code quality scripts');

    expect(automatedChecks?.passed).toBe(false);
    expect(codeQuality?.passed).toBe(true);
    expect(codeQuality?.detail).toBe('Found a typecheck script.');
  });

  it('accepts test files in various locations', () => {
    const projectPath = makeProject();

    mkdirSync(resolve(projectPath, 'src'), { recursive: true });
    mkdirSync(resolve(projectPath, 'src/__tests__'), { recursive: true });
    writeFileSync(resolve(projectPath, 'src/example.test.ts'), 'export {};\n');
    writeFileSync(resolve(projectPath, 'src/__tests__/example.test.ts'), 'export {};\n');

    const results = analyzeProject(projectPath);
    const automatedChecks = results.find((result) => result.label === 'Automated checks');

    expect(automatedChecks?.passed).toBe(true);
  });

  it('detects test files with different extensions (.spec.ts, .test.js)', () => {
    const projectPath = makeProject();

    mkdirSync(resolve(projectPath, 'tests'), { recursive: true });
    writeFileSync(resolve(projectPath, 'tests/example.spec.ts'), 'export {};\n');
    writeFileSync(resolve(projectPath, 'tests/example.test.js'), 'export {};\n');

    const results = analyzeProject(projectPath);
    const automatedChecks = results.find((result) => result.label === 'Automated checks');

    expect(automatedChecks?.passed).toBe(true);
  });

  it('detects nested test files within max depth', () => {
    const projectPath = makeProject();

    mkdirSync(resolve(projectPath, 'src/components/FeatureA'), { recursive: true });
    writeFileSync(
      resolve(projectPath, 'src/components/FeatureA/FeatureA.test.ts'),
      'export {};\n'
    );

    const results = analyzeProject(projectPath);
    const automatedChecks = results.find((result) => result.label === 'Automated checks');

    expect(automatedChecks?.passed).toBe(true);
  });

  it('returns partial score when some checks pass and others fail', () => {
    const projectPath = makeProject();

    mkdirSync(resolve(projectPath, '.git'));
    writeFileSync(resolve(projectPath, 'README.md'), '# Demo\n');
    writeFileSync(
      resolve(projectPath, 'package.json'),
      JSON.stringify(
        {
          name: 'demo',
          scripts: {
            test: 'vitest run',
            lint: 'eslint .'
          }
        },
        null,
        2
      )
    );

    const results = analyzeProject(projectPath);
    const score = results.reduce((sum, result) => sum + (result.passed ? result.points : 0), 0);

    // Should be: repository metadata (10) + project manifest (20) + documentation (15) + automated checks (30) + code quality (15) = 90
    // CI readiness (10) will fail
    expect(score).toBe(90);
  });

  it('provides appropriate recommendations for failed checks', () => {
    const projectPath = makeProject();

    writeFileSync(
      resolve(projectPath, 'package.json'),
      JSON.stringify({ name: 'demo' }, null, 2)
    );

    const results = analyzeProject(projectPath);
    const repoMetadata = results.find((result) => result.label === 'Repository metadata');
    const manifest = results.find((result) => result.label === 'Project manifest');
    const documentation = results.find((result) => result.label === 'Documentation');
    const automatedChecks = results.find((result) => result.label === 'Automated checks');
    const codeQuality = results.find((result) => result.label === 'Code quality scripts');
    const ci = results.find((result) => result.label === 'CI readiness');

    expect(repoMetadata?.recommendation).toBe('Initialize git to track health changes over time.');
    expect(manifest?.recommendation).toBe('Add a manifest like package.json, pyproject.toml, go.mod, or pom.xml.');
    expect(documentation?.recommendation).toBe('Add a README with setup, commands, and project purpose.');
    expect(automatedChecks?.recommendation).toBe('Add at least one automated test or a test script.');
    expect(codeQuality?.recommendation).toBe('Add lint and typecheck commands to catch issues early.');
    expect(ci?.recommendation).toBe('Add a CI workflow to run checks automatically on every push.');
  });

  it('handles projects with different manifest types', () => {
    const projectPath = makeProject();

    mkdirSync(resolve(projectPath, 'src'), { recursive: true });
    writeFileSync(resolve(projectPath, 'pyproject.toml'), '[project]\nname = "demo"');
    mkdirSync(resolve(projectPath, '.git'), { recursive: true });
    writeFileSync(resolve(projectPath, 'README.md'), '# Demo\n');

    const results = analyzeProject(projectPath);
    const manifest = results.find((result) => result.label === 'Project manifest');

    expect(manifest?.passed).toBe(true);
  });
});
