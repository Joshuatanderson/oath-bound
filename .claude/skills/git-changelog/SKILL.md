---
name: git-changelog
description: Generates a formatted changelog from recent git commits. Groups commits by type (feat, fix, chore, docs, refactor) and outputs clean markdown. Use when you need to summarize recent changes for a release, PR description, or team update.
license: MIT
compatibility: Requires git
allowed-tools: bash read grep
---
# Git Changelog Generator

Generate a well-formatted changelog from recent git commits.

## Usage

When invoked, perform the following steps:

1. **Read recent commits** using `git log` with the `--oneline` format. Default to the last 20 commits unless the user specifies a range or count.

2. **Categorize commits** by their conventional commit prefix:
   - `feat:` → Features
   - `fix:` → Bug Fixes
   - `chore:` → Maintenance
   - `docs:` → Documentation
   - `refactor:` → Refactoring
   - `test:` → Tests
   - `perf:` → Performance
   - `ci:` → CI/CD
   - Unprefixed → Other

3. **Output a markdown changelog** in this format:

```markdown
## Changelog (vX.X.X)

### Features
- Description of feature commit (abc1234)

### Bug Fixes
- Description of fix commit (def5678)

### Maintenance
- Description of chore commit (ghi9012)
```

4. **Include metadata**:
   - Date range covered
   - Total commit count
   - Contributors (from git log authors)

## Options

The user may specify:
- A commit range: `git-changelog v1.0.0..HEAD`
- A count: `git-changelog --last 50`
- Output location: write to a file or print to conversation

## Example

User: "Generate a changelog for the last 10 commits"

```bash
git log --oneline -10 --format="%h %s (%an)"
```

Then parse, categorize, and format the output.
