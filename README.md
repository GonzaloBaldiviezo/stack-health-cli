# stack-health-cli

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

## New command options

- `--format text|json`: choose human output (`text`) or machine-readable output (`json`).
- `--min-score <0-100>`: if score is lower than this value, command exits with code `1`.

Examples:

```bash
# JSON for CI or scripts
pnpm dev analyze --format json

# Fail pipeline when score is below 70
pnpm dev analyze --min-score 70
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