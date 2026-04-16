import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type NormalizedTestResult = {
  executed: boolean;
  stack: 'node' | 'python' | 'unknown';
  runner: string | null;
  command: string | null;
  source: 'junit' | 'exit-code' | 'none';
  success: boolean | null;
  exitCode: number | null;
  total: number | null;
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  durationMs: number | null;
  details?: string;
};

type JUnitSummary = {
  total: number;
  failed: number;
  skipped: number;
  durationMs: number | null;
};

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

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributeRegex = /(\w+)="([^"]*)"/g;

  let match = attributeRegex.exec(tag);
  while (match) {
    attributes[match[1]] = match[2];
    match = attributeRegex.exec(tag);
  }

  return attributes;
}

function parseNumber(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseJUnitXml(xmlContent: string): JUnitSummary | null {
  const testsuiteTags = xmlContent.match(/<testsuite\b[^>]*>/g);

  if (!testsuiteTags || testsuiteTags.length === 0) {
    const testsuitesTag = xmlContent.match(/<testsuites\b[^>]*>/)?.[0];
    if (!testsuitesTag) {
      return null;
    }

    const attributes = parseAttributes(testsuitesTag);
    const total = parseNumber(attributes.tests);
    const failures = parseNumber(attributes.failures) + parseNumber(attributes.errors);
    const skipped = parseNumber(attributes.skipped);
    const timeSeconds = Number(attributes.time);

    return {
      total,
      failed: failures,
      skipped,
      durationMs: Number.isFinite(timeSeconds) ? Math.round(timeSeconds * 1000) : null
    };
  }

  let total = 0;
  let failed = 0;
  let skipped = 0;
  let durationMs = 0;
  let hasDuration = false;

  for (const testsuiteTag of testsuiteTags) {
    const attributes = parseAttributes(testsuiteTag);
    total += parseNumber(attributes.tests);
    failed += parseNumber(attributes.failures) + parseNumber(attributes.errors);
    skipped += parseNumber(attributes.skipped);

    const timeSeconds = Number(attributes.time);
    if (Number.isFinite(timeSeconds)) {
      durationMs += Math.round(timeSeconds * 1000);
      hasDuration = true;
    }
  }

  return {
    total,
    failed,
    skipped,
    durationMs: hasDuration ? durationMs : null
  };
}

function detectNodeCommand(projectPath: string): { command: string; runner: string } | null {
  const packageJsonPath = resolve(projectPath, 'package.json');
  const packageJson = readJsonFile<PackageJson>(packageJsonPath);

  if (!packageJson) {
    return null;
  }

  const testScript = packageJson.scripts?.test ?? '';
  const usesVitest =
    /\bvitest\b/.test(testScript) ||
    Boolean(packageJson.dependencies?.vitest) ||
    Boolean(packageJson.devDependencies?.vitest);

  if (usesVitest) {
    return {
      command: 'pnpm vitest run --reporter=junit --outputFile .stack-health-junit.xml',
      runner: 'vitest'
    };
  }

  if (testScript.trim().length > 0) {
    return {
      command: 'pnpm test',
      runner: 'npm-script'
    };
  }

  return null;
}

function detectPythonCommand(projectPath: string): { command: string; runner: string } | null {
  const pyprojectPath = resolve(projectPath, 'pyproject.toml');
  const requirementsPath = resolve(projectPath, 'requirements.txt');

  const hasPythonProject = existsSync(pyprojectPath) || existsSync(requirementsPath);
  if (!hasPythonProject) {
    return null;
  }

  return {
    command: 'pytest -q --junitxml=.stack-health-junit.xml',
    runner: 'pytest'
  };
}

export function runNormalizedTests(projectPath: string): NormalizedTestResult {
  const node = detectNodeCommand(projectPath);
  const python = detectPythonCommand(projectPath);
  const selected = node ?? python;

  if (!selected) {
    return {
      executed: false,
      stack: 'unknown',
      runner: null,
      command: null,
      source: 'none',
      success: null,
      exitCode: null,
      total: null,
      passed: null,
      failed: null,
      skipped: null,
      durationMs: null,
      details: 'No supported test command detected.'
    };
  }

  const stack = node ? 'node' : 'python';
  const junitPath = resolve(projectPath, '.stack-health-junit.xml');
  rmSync(junitPath, { force: true });

  const start = Date.now();
  const commandResult = spawnSync(selected.command, {
    cwd: projectPath,
    shell: true,
    encoding: 'utf8'
  });
  const durationMs = Date.now() - start;

  const exitCode = commandResult.status;
  const combinedOutput = [commandResult.stdout ?? '', commandResult.stderr ?? ''].join('\n').trim();

  if (existsSync(junitPath)) {
    const junitContent = readFileSync(junitPath, 'utf8');
    const summary = parseJUnitXml(junitContent);
    rmSync(junitPath, { force: true });

    if (summary) {
      const passed = Math.max(summary.total - summary.failed - summary.skipped, 0);
      return {
        executed: true,
        stack,
        runner: selected.runner,
        command: selected.command,
        source: 'junit',
        success: summary.failed === 0 && exitCode === 0,
        exitCode,
        total: summary.total,
        passed,
        failed: summary.failed,
        skipped: summary.skipped,
        durationMs: summary.durationMs ?? durationMs,
        details: combinedOutput.length > 0 ? combinedOutput : undefined
      };
    }
  }

  return {
    executed: true,
    stack,
    runner: selected.runner,
    command: selected.command,
    source: 'exit-code',
    success: exitCode === 0,
    exitCode,
    total: null,
    passed: null,
    failed: null,
    skipped: null,
    durationMs,
    details: combinedOutput.length > 0 ? combinedOutput : undefined
  };
}
