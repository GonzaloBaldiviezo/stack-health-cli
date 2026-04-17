# stack-health-cli

[![CI](https://github.com/GonzaloBaldiviezo/stack-health-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/GonzaloBaldiviezo/stack-health-cli/actions/workflows/ci.yml)

Basic MVP for a CLI that analyzes a local project and returns a simple health result.

## What it does

This first version does three things:

- exposes a CLI command
- inspects a local folder for basic project health signals
- calculates a simple score from those checks

## Install

```bash
pnpm install
```

## Run in development

```bash
pnpm dev analyze
pnpm dev analyze --path .
pnpm dev analyze --format json
pnpm dev analyze --min-score 70
pnpm dev analyze --run-tests
```

## Build and run

```bash
pnpm build
pnpm start analyze
pnpm start analyze --format json --min-score 70
```

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## CI

GitHub Actions workflow is available at `.github/workflows/ci.yml`.

It runs on push and pull request and executes:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm dev analyze --min-score 90`

## New command options

- `--format text|json`: choose human output (`text`) or machine-readable output (`json`).
- `--min-score <0-100>`: if score is lower than this value, command exits with code `1`.
- `--run-tests`: runs detected test command (Node or Python) and reports normalized results.

`--run-tests` currently supports:

- Node projects using `vitest` (full metrics)
- Node projects using `jest` (full metrics)
- Python projects using `pytest` (full metrics)
- Python projects using `unittest` (exit-code only)

When JUnit output is available, report includes a normalized summary:

- `total`
- `passed`
- `failed`
- `skipped`
- `durationMs`

If a runner cannot produce structured output, the tool falls back to `success/failure` and `exitCode` only.

When `--run-tests` is enabled and tests fail, the CLI applies a score penalty:

- `-20` points from the base score

Examples:

```bash
# JSON for CI or scripts
pnpm dev analyze --format json

# Fail pipeline when score is below 70
pnpm dev analyze --min-score 70

# Include test execution details in the report
pnpm dev analyze --run-tests
```

## Expected output

```text
CLI working
Analyzing project at: /absolute/path/to/project
Health score: 55/100

PASS Repository metadata (10 pts)
	Git repository detected.
FAIL Automated checks (30 pts)
	No test script or test files detected.

Next improvements
- Add at least one automated test or a test script.
```

## Current scoring rules

- Git repository present: 10 points
- Project manifest present: 20 points
- README present: 15 points
- Tests detected: 30 points
- Lint or typecheck script detected: 15 points
- CI configuration detected: 10 points

## Why each check matters

Each result includes a link to the public checks documentation page that explains:
- What the check does and why it matters
- Real consequences of failing each check
- Step-by-step fixes for each item

This way, the CLI doesn't just score you—it educates you.

Docs URL:

```text
https://gonzalobaldiviezo.github.io/stack-health-cli/checks/
```