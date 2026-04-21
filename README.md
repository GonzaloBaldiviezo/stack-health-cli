# stack-health-cli

[![CI](https://github.com/GonzaloBaldiviezo/stack-health-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/GonzaloBaldiviezo/stack-health-cli/actions/workflows/ci.yml)

**Stack Health CLI** is a tool that analyzes the health of your local project and generates a report with a health score based on best practices.

## Installation

```bash
pnpm install
```

## Main commands

The main command is `analyze` which inspects a project and generates a report:

```bash
pnpm dev analyze
```

## Using the analyze command

### Basic format

Analyzes the current directory by default:

```bash
pnpm dev analyze
```

### Analyze a specific directory

Use the `--path` option to analyze a project in another directory:

```bash
# Analyze root directory
pnpm dev analyze --path .

# Analyze a project in another location
pnpm dev analyze --path ../my-project
pnpm dev analyze --path /absolute/path/to/project
```

### Output formats

By default shows a human-readable report. Use `--format` to get JSON:

```bash
# Human-readable report (default)
pnpm dev analyze

# JSON output for CI/scripts
pnpm dev analyze --format json
```

### Setting thresholds

Define a minimum score for the command to fail if not met:

```bash
# Fail if score is below 70
pnpm dev analyze --min-score 70
```

### Run project tests

Also analyzes project tests and reports results:

```bash
pnpm dev analyze --run-tests
```

## Complete analyze command options

```bash
pnpm dev analyze [options]
```

**Available options:**

| Option | Description | Example |
|--------|-------------|---------|
| `-h, --help` | Display help information | `pnpm dev analyze --help` |
| `--path <path>` | Directory to analyze | `--path .` |
| `--format <format>` | Output format (text or json) | `--format json` |
| `--min-score <number>` | Minimum score (0-100) | `--min-score 70` |
| `--run-tests` | Run project tests | `-` |

## Common usage examples

### 1. Quick project analysis
```bash
pnpm dev analyze
```

### 2. Generate report for CI/CD
```bash
pnpm dev analyze --format json
```

### 3. Fail if quality is low
```bash
pnpm dev analyze --min-score 70
```

### 4. Analyze and run tests
```bash
pnpm dev analyze --run-tests
```

### 5. Combine multiple options
```bash
pnpm dev analyze --path ./src --format json --min-score 80 --run-tests
```

## Build and production mode

To use the compiled version:

```bash
pnpm build
pnpm start analyze
```

## Quality commands

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## How the score works

The tool evaluates several aspects of your project:

| Check | Points |
|-------|--------|
| Git repository present | 10 |
| Project manifest (package.json, etc) | 20 |
| README.md present | 15 |
| Test files detected | 30 |
| Lint/typecheck scripts | 15 |
| CI configuration detected | 10 |
| Penalty for failed tests | -20 |

## What the results mean

The health score helps identify areas for improvement:

- **90-100**: Excellent - Your project follows all best practices
- **70-89**: Good - Some areas can be improved
- **50-69**: Needs work - Consider the recommendations
- **0-49**: High risk - Your project needs urgent attention

## Check documentation

For understanding what each check means and how to improve:

```
https://gonzalobaldiviezo.github.io/stack-health-cli/checks/
```