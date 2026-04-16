#!/usr/bin/env node

import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';
import { analyzeProject } from './analyzer.js';
import { runNormalizedTests } from './test-execution.js';

type AnalyzeOptions = {
  path: string;
  format: 'text' | 'json';
  minScore?: number;
  runTests?: boolean;
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
  .option('--run-tests', 'Execute tests and include normalized runtime results', false)
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
    const testRun = options.runTests ? runNormalizedTests(projectPath) : null;

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
            testRun,
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

    if (testRun) {
      console.log('');
      console.log(chalk.bold('Test execution'));
      console.log(`Runner: ${testRun.runner ?? 'unknown'} (${testRun.stack})`);
      if (testRun.command) {
        console.log(`Command: ${testRun.command}`);
      }

      if (!testRun.executed) {
        console.log(chalk.yellow(`Status: skipped (${testRun.details ?? 'No supported runner detected'})`));
      } else {
        const testStatus = testRun.success ? chalk.green('PASS') : chalk.red('FAIL');
        console.log(`Status: ${testStatus} (exit code: ${testRun.exitCode ?? 'n/a'})`);

        if (typeof testRun.total === 'number') {
          console.log(
            `Summary: total=${testRun.total} passed=${testRun.passed ?? 0} failed=${testRun.failed ?? 0} skipped=${testRun.skipped ?? 0}`
          );
        }

        if (typeof testRun.durationMs === 'number') {
          console.log(`Duration: ${testRun.durationMs}ms`);
        }
      }
    }

    if (!thresholdMet) {
      process.exitCode = 1;
    }
  });

program.parse();