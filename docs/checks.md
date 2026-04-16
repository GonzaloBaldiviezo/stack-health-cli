# Health Checks — Explanation & Rationale

This document explains each check performed by the CLI and why it matters for project health.

---

## Repository metadata

**What it checks:** Presence of a `.git` directory.

**Why it matters:**
- **Traceability** — Git history is the only way to know who changed what, when, and why. Without it, changes are invisible and irreversible mistakes become permanent.
- **Collaboration** — No version control means no branches, no code reviews, no conflict resolution. Teams can't work safely together.
- **Automation foundation** — All CI/CD, automated testing, and safe deployments depend on git as the source of truth.
- **Debugging** — When bugs appear, git bisect and blame are your only tools to find the culprit. No git = no answers.

**What to do:**
```bash
git init
```

---

## Project manifest

**What it checks:** Presence of a dependency/build manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, etc.).

**Why it matters:**
- **Reproducibility** — A manifest declares exact dependencies and versions. Without it, "it works on my machine" is the only guarantee.
- **Environment consistency** — New team members, CI runners, and production need the same exact setup. A manifest ensures that.
- **Audit trail** — You can track when dependencies changed and why, enabling security patching and regression diagnosis.
- **Build clarity** — The manifest documents how to build and run the project. It's the contract with future maintainers (including yourself).

**What to do:**
- **Node.js:** `npm init -y` or `pnpm init`
- **Python:** Create `pyproject.toml` or `requirements.txt`
- **Go:** `go mod init github.com/user/repo`

---

## Documentation

**What it checks:** Presence of a README (`README.md`, `README`, etc.).

**Why it matters:**
- **Onboarding** — Without docs, new team members waste hours figuring out what the project does and how to run it.
- **Maintenance** — A well-documented project is maintainable. Without docs, tribal knowledge dies when people leave.
- **Credibility** — A readable README signals professionalism and care. It's the first impression of your project.
- **Usage clarity** — External users or teams won't adopt a tool they don't understand.

**What to do:**
- Start with the essentials:
  - What the project does (one sentence)
  - How to install it
  - How to run it
  - How to contribute
  - License

---

## Automated checks

**What it checks:**
- Presence of a `test` script in `package.json` (or similar in other ecosystems).
- OR presence of test files matching patterns like `*.test.ts`, `*.spec.ts`, `__tests__/`, etc.

**Why it matters:**
- **Reliability** — Tests catch bugs before users do. Without tests, every change is a potential disaster.
- **Confidence** — With tests, you can refactor safely. Without them, fear paralyzes development.
- **Documentation** — Tests are executable specs of how the code should behave.
- **Regression prevention** — Tests prevent old bugs from resurfacing after fixes.

**What to do:**
- Pick a test framework: `jest`, `vitest`, `mocha` (Node.js), `pytest` (Python), `go test` (Go), etc.
- Write at least one test per module.
- Add a `test` script to your manifest:
  ```json
  "scripts": { "test": "jest" }
  ```

---

## Code quality scripts

**What it checks:** Presence of `lint` or `typecheck` scripts in the build manifest.

**Why it matters:**
- **Consistency** — Linters enforce a consistent code style, reducing cognitive load when reading others' code.
- **Bug prevention** — Modern linters catch common mistakes (unused variables, unreachable code, type errors) before runtime.
- **Security** — Linters can flag dangerous patterns (insecure randomness, missing input validation, etc.).
- **Automation** — CI can enforce quality standards, catching problems before code review even starts.

**What to do:**
- **Linting:** Use `eslint` (JavaScript), `pylint` (Python), `golangci-lint` (Go), etc.
- **Type checking:** Use `tsc` (TypeScript), `mypy` (Python), etc.
- Add scripts:
  ```json
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  }
  ```

---

## CI readiness

**What it checks:** Presence of CI configuration (`.github/workflows`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `.circleci/config.yml`, etc.).

**Why it matters:**
- **Automated enforcement** — CI runs tests, linting, and builds on every push, catching problems immediately.
- **Safety net** — Without CI, broken code can merge to main. CI prevents that.
- **Visibility** — Teams know the status of builds and tests in real time.
- **Evidence** — Deployments should only happen after CI passes. This creates an audit trail of what was tested.

**What to do:**
- Use GitHub Actions (free, native to GitHub):
  ```yaml
  name: CI
  on: [push, pull_request]
  jobs:
    build:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: actions/setup-node@v3
          with:
            node-version: 20
        - run: npm ci
        - run: npm run lint
        - run: npm run typecheck
        - run: npm test
  ```
- Or use GitLab CI, CircleCI, Azure Pipelines, etc., depending on your host.

---

## Next steps

If you're improving your project's health:

1. **Start with Repository metadata & Project manifest** — These are prerequisites for everything else.
2. **Add Documentation** — It's quick and immediately valuable.
3. **Add tests** — Start with one test suite, then expand.
4. **Add linting & type checking** — These catch bugs and improve readability.
5. **Set up CI** — Automate the enforcement of all the above.

Each step builds on the last. Don't try to do everything at once.
