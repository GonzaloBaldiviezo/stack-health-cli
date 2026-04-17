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
  source: 'junit' | 'jest-json' | 'exit-code' | 'none';
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

type JestSummary = {
  total: number;
  failed: number;
  skipped: number;
  durationMs: number | null;
};

type DetectedCommand = {
  command: string;
  runner: string;
  reportKind: 'junit' | 'jest-json' | 'none';
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

export function parseJestJson(jsonContent: string): JestSummary | null {
  try {
    const parsed = JSON.parse(jsonContent) as {
      numTotalTests?: number;
      numPassedTests?: number;
      numFailedTests?: number;
      numPendingTests?: number;
      startTime?: number;
      testResults?: Array<{ perfStats?: { end?: number; start?: number } }>;
    };

    const total = Number(parsed.numTotalTests ?? 0);
    const failed = Number(parsed.numFailedTests ?? 0);
    const skipped = Number(parsed.numPendingTests ?? 0);

    if (!Number.isFinite(total) || !Number.isFinite(failed) || !Number.isFinite(skipped)) {
      return null;
    }

    let durationMs: number | null = null;

    if (Array.isArray(parsed.testResults) && parsed.testResults.length > 0) {
      const sum = parsed.testResults.reduce((acc, testResult) => {
        const start = Number(testResult.perfStats?.start);
        const end = Number(testResult.perfStats?.end);
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
          return acc + (end - start);
        }

        return acc;
      }, 0);

      if (sum > 0) {
        durationMs = Math.round(sum);
      }
    }

    if (durationMs === null && Number.isFinite(Number(parsed.startTime))) {
      durationMs = null;
    }

    return {
      total,
      failed,
      skipped,
      durationMs
    };
  } catch {
    return null;
  }
}

function detectNodeCommand(projectPath: string): DetectedCommand | null {
  const packageJsonPath = resolve(projectPath, 'package.json');
  const packageJson = readJsonFile<PackageJson>(packageJsonPath);

  if (!packageJson) {
    return null;
  }

  const testScript = packageJson.scripts?.test ?? '';
  const usesJest =
    /\bjest\b/.test(testScript) ||
    Boolean(packageJson.dependencies?.jest) ||
    Boolean(packageJson.devDependencies?.jest);
  const usesVitest =
    /\bvitest\b/.test(testScript) ||
    Boolean(packageJson.dependencies?.vitest) ||
    Boolean(packageJson.devDependencies?.vitest);

  if (usesJest) {
    return {
      command: 'pnpm jest --ci --json --outputFile .stack-health-jest.json',
      runner: 'jest',
      reportKind: 'jest-json'
    };
  }

  if (usesVitest) {
    return {
      command: 'pnpm vitest run --reporter=junit --outputFile .stack-health-junit.xml',
      runner: 'vitest',
      reportKind: 'junit'
    };
  }

  if (testScript.trim().length > 0) {
    return {
      command: 'pnpm test',
      runner: 'npm-script',
      reportKind: 'none'
    };
  }

  return null;
}

function detectPythonCommand(projectPath: string): DetectedCommand | null {
  const pyprojectPath = resolve(projectPath, 'pyproject.toml');
  const requirementsPath = resolve(projectPath, 'requirements.txt');
  const pytestIniPath = resolve(projectPath, 'pytest.ini');

  const hasPythonProject = existsSync(pyprojectPath) || existsSync(requirementsPath) || existsSync(resolve(projectPath, 'setup.py'));
  if (!hasPythonProject) {
    return null;
  }

  const pyprojectContent = existsSync(pyprojectPath) ? readFileSync(pyprojectPath, 'utf8') : '';
  const requirementsContent = existsSync(requirementsPath) ? readFileSync(requirementsPath, 'utf8') : '';
  const usesPytest =
    existsSync(pytestIniPath) || /\bpytest\b/i.test(pyprojectContent) || /\bpytest\b/i.test(requirementsContent);

  if (usesPytest) {
    return {
      command: 'pytest -q --junitxml=.stack-health-junit.xml',
      runner: 'pytest',
      reportKind: 'junit'
    };
  }

  return {
    command: 'python -m unittest discover',
    runner: 'unittest',
    reportKind: 'none'
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
  const jestJsonPath = resolve(projectPath, '.stack-health-jest.json');
  rmSync(junitPath, { force: true });
  rmSync(jestJsonPath, { force: true });

  const start = Date.now();
  const commandResult = spawnSync(selected.command, {
    cwd: projectPath,
    shell: true,
    encoding: 'utf8'
  });
  const durationMs = Date.now() - start;

  const exitCode = typeof commandResult.status === 'number' ? commandResult.status : 1;
  const combinedOutput = [commandResult.stdout ?? '', commandResult.stderr ?? ''].join('\n').trim();

  if (selected.reportKind === 'junit' && existsSync(junitPath)) {
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

  if (selected.reportKind === 'jest-json' && existsSync(jestJsonPath)) {
    const jestJsonContent = readFileSync(jestJsonPath, 'utf8');
    const summary = parseJestJson(jestJsonContent);
    rmSync(jestJsonPath, { force: true });

    if (summary) {
      const passed = Math.max(summary.total - summary.failed - summary.skipped, 0);
      return {
        executed: true,
        stack,
        runner: selected.runner,
        command: selected.command,
        source: 'jest-json',
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

  rmSync(junitPath, { force: true });
  rmSync(jestJsonPath, { force: true });

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
