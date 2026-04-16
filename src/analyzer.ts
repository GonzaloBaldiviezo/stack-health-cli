import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type CheckResult = {
  label: string;
  passed: boolean;
  points: number;
  detail: string;
  recommendation?: string;
  docAnchor?: string;
};

export function findFirstExisting(projectPath: string, candidates: string[]): string | undefined {
  return candidates.find((candidate) => existsSync(resolve(projectPath, candidate)));
}

export function findMatchingFile(projectPath: string, maxDepth = 3): string | undefined {
  const queue: Array<{ directory: string; depth: number }> = [{ directory: projectPath, depth: 0 }];
  const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next']);
  const pattern = /(\.|-)(test|spec)\.[cm]?[jt]sx?$|(^|\/)(test|tests|__tests__)$/i;

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const entries = readdirSync(current.directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = resolve(current.directory, entry.name);
      const relativePath = fullPath.slice(projectPath.length + 1);

      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name) || current.depth >= maxDepth) {
          continue;
        }

        if (pattern.test(relativePath)) {
          return relativePath;
        }

        queue.push({ directory: fullPath, depth: current.depth + 1 });
        continue;
      }

      if (pattern.test(relativePath)) {
        return relativePath;
      }
    }
  }

  return undefined;
}

function readJsonFile<T>(filePath: string): T | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

export function analyzeProject(projectPath: string): CheckResult[] {
  const manifestFile = findFirstExisting(projectPath, [
    'package.json',
    'pyproject.toml',
    'go.mod',
    'Cargo.toml',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts'
  ]);
  const readmeFile = findFirstExisting(projectPath, ['README.md', 'README', 'readme.md']);
  const ciFile = findFirstExisting(projectPath, [
    '.github/workflows',
    '.gitlab-ci.yml',
    'azure-pipelines.yml',
    '.circleci/config.yml'
  ]);
  const packageJsonPath = resolve(projectPath, 'package.json');
  const packageJson = readJsonFile<{ scripts?: Record<string, string> }>(packageJsonPath);
  const scripts = packageJson?.scripts ?? {};
  const hasTestScript = typeof scripts.test === 'string' && scripts.test.trim().length > 0;
  const hasLintScript = typeof scripts.lint === 'string' && scripts.lint.trim().length > 0;
  const hasTypecheckScript = typeof scripts.typecheck === 'string' && scripts.typecheck.trim().length > 0;
  const matchingTestFile = findMatchingFile(projectPath);

  return [
    {
      label: 'Repository metadata',
      passed: existsSync(resolve(projectPath, '.git')),
      points: 10,
      detail: existsSync(resolve(projectPath, '.git')) ? 'Git repository detected.' : 'No .git directory found.',
      recommendation: 'Initialize git to track health changes over time.',
      docAnchor: '#repository-metadata'
    },
    {
      label: 'Project manifest',
      passed: Boolean(manifestFile),
      points: 20,
      detail: manifestFile ? `Found ${manifestFile}.` : 'No common project manifest found.',
      recommendation: 'Add a manifest like package.json, pyproject.toml, go.mod, or pom.xml.',
      docAnchor: '#project-manifest'
    },
    {
      label: 'Documentation',
      passed: Boolean(readmeFile),
      points: 15,
      detail: readmeFile ? `Found ${readmeFile}.` : 'README file not found.',
      recommendation: 'Add a README with setup, commands, and project purpose.',
      docAnchor: '#documentation'
    },
    {
      label: 'Automated checks',
      passed: Boolean(hasTestScript || matchingTestFile),
      points: 30,
      detail: hasTestScript
        ? 'Found a test script in package.json.'
        : matchingTestFile
          ? `Found test-related files at ${matchingTestFile}.`
          : 'No test script or test files detected.',
      recommendation: 'Add at least one automated test or a test script.',
      docAnchor: '#automated-checks'
    },
    {
      label: 'Code quality scripts',
      passed: hasLintScript || hasTypecheckScript,
      points: 15,
      detail:
        hasLintScript && hasTypecheckScript
          ? 'Found lint and typecheck scripts.'
          : hasLintScript
            ? 'Found a lint script.'
            : hasTypecheckScript
              ? 'Found a typecheck script.'
              : 'No lint or typecheck scripts detected.',
      recommendation: 'Add lint and typecheck commands to catch issues early.',
      docAnchor: '#code-quality-scripts'
    },
    {
      label: 'CI readiness',
      passed: Boolean(ciFile),
      points: 10,
      detail: ciFile ? `Found CI configuration at ${ciFile}.` : 'No CI configuration detected.',
      recommendation: 'Add a CI workflow to run checks automatically on every push.',
      docAnchor: '#ci-readiness'
    }
  ];
}
