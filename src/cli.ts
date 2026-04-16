#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';

type CheckResult = {
  label: string;
  passed: boolean;
  points: number;
  detail: string;
  recommendation?: string;
  docAnchor?: string;
};

type AnalyzeOptions = {
  path: string;
  format: 'text' | 'json';
  minScore?: number;
};

const docsFilePath = fileURLToPath(new URL('../docs/checks.md', import.meta.url));
const docsFileUri = pathToFileURL(docsFilePath).href;
const remoteDocsBaseUrl = 'https://gonzalobaldiviezo.github.io/stack-health-cli/checks/';

function getCheckDocLink(anchor: string): string {
  if (remoteDocsBaseUrl.startsWith('https://')) {
    return `${remoteDocsBaseUrl}${anchor}`;
  }

  return `${docsFileUri}${anchor}`;
}

const program = new Command();

function findFirstExisting(projectPath: string, candidates: string[]): string | undefined {
  return candidates.find((candidate) => existsSync(resolve(projectPath, candidate)));
}

function findMatchingFile(projectPath: string, maxDepth = 3): string | undefined {
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

function analyzeProject(projectPath: string): CheckResult[] {
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

function scoreColor(score: number): (text: string) => string {
  if (score >= 80) {
    return chalk.green;
  }

  if (score >= 50) {
    return chalk.yellow;
  }

  return chalk.red;
}

program
  .name('project-health')
  .description('Analyze a local project and return a basic health score.')
  .version('0.1.0');

program
  .command('analyze')
  .description('Analyze a project path and print a basic health result.')
  .option('-p, --path <path>', 'Path to the project to analyze', cwd())
  .option('-f, --format <format>', 'Output format: text or json', 'text')
  .option('--min-score <score>', 'Fail with exit code 1 if score is below this value (0-100)', Number)
  .action((options: AnalyzeOptions) => {
    const projectPath = resolve(options.path);
    const projectStats = statSync(projectPath, { throwIfNoEntry: false });
    const requestedFormat = options.format;
    const minScore = options.minScore;

    if (requestedFormat !== 'text' && requestedFormat !== 'json') {
      console.error(chalk.red(`Invalid format: ${requestedFormat}. Use "text" or "json".`));
      process.exitCode = 1;
      return;
    }

    if (typeof minScore === 'number' && (!Number.isFinite(minScore) || minScore < 0 || minScore > 100)) {
      console.error(chalk.red(`Invalid --min-score value: ${minScore}. Expected a number between 0 and 100.`));
      process.exitCode = 1;
      return;
    }

    if (!projectStats?.isDirectory()) {
      if (requestedFormat === 'json') {
        console.log(
          JSON.stringify(
            {
              ok: false,
              error: `Path does not exist or is not a directory: ${projectPath}`
            },
            null,
            2
          )
        );
      } else {
        console.error(chalk.red(`Path does not exist or is not a directory: ${projectPath}`));
      }

      process.exitCode = 1;
      return;
    }

    const results = analyzeProject(projectPath);
    const score = results.reduce((sum, result) => sum + (result.passed ? result.points : 0), 0);
    const openFindings = results.filter((result) => !result.passed);
    const colorizeScore = scoreColor(score);
    const thresholdMet = typeof minScore === 'number' ? score >= minScore : true;

    if (requestedFormat === 'json') {
      console.log(
        JSON.stringify(
          {
            ok: true,
            projectPath,
            score,
            maxScore: 100,
            minScore: minScore ?? null,
            thresholdMet,
            checks: results.map((result) => ({
              label: result.label,
              passed: result.passed,
              points: result.points,
              detail: result.detail,
              recommendation: result.recommendation ?? null,
              docLink: result.docAnchor ? getCheckDocLink(result.docAnchor) : null
            })),
            recommendations: openFindings.map((finding) => finding.recommendation)
          },
          null,
          2
        )
      );

      if (!thresholdMet) {
        process.exitCode = 1;
      }

      return;
    }

    console.log(chalk.green('CLI working'));
    console.log(`Analyzing project at: ${chalk.cyan(projectPath)}`);
    console.log(`${chalk.bold('Health score:')} ${colorizeScore(`${score}/100`)}`);

    if (typeof minScore === 'number') {
      const thresholdStatus = thresholdMet ? chalk.green('PASS') : chalk.red('FAIL');
      console.log(`${chalk.bold('Minimum score check:')} ${thresholdStatus} (required: ${minScore})`);
    }

    console.log('');

    for (const result of results) {
      const status = result.passed ? chalk.green('PASS') : chalk.red('FAIL');
      console.log(`${status} ${result.label} (${result.points} pts)`);
      console.log(`  ${result.detail}`);
      if (result.docAnchor) {
        console.log(`  ${chalk.dim(`Learn more: ${getCheckDocLink(result.docAnchor)}`)}`);
      }
    }

    if (openFindings.length > 0) {
      console.log('');
      console.log(chalk.bold('Next improvements'));

      for (const finding of openFindings) {
        console.log(`- ${finding.recommendation}`);
      }
    }

    if (!thresholdMet) {
      process.exitCode = 1;
    }
  });

program.parse();