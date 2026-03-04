---
name: git-changelog
description: Generates a formatted changelog from recent git commits. Groups commits by type (feat, fix, chore, docs, refactor) and outputs clean markdown. Use when you need to summarize recent changes for a release, PR description, or team update.
license: MIT
---

# Git Changelog Generator

Generate a clean, categorized changelog from recent git commits.

## When to use

- Before creating a release or tag
- Writing PR descriptions that summarize branch work
- Team updates or standup summaries
- Sprint retrospectives

## How to generate

1. Run `git log` with the appropriate range
2. Parse commit messages by conventional commit prefix
3. Group into categories and format as markdown

### Step-by-step

```bash
# Get commits since last tag
git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline
```

### Categorization rules

| Prefix | Category |
|--------|----------|
| `feat:` | Features |
| `fix:` | Bug Fixes |
| `docs:` | Documentation |
| `refactor:` | Refactoring |
| `test:` | Tests |
| `chore:` | Chores |
| (other) | Other |

### Output format

```markdown
## Changelog

### Features
- Add user authentication flow
- Support dark mode toggle

### Bug Fixes
- Fix race condition in websocket handler
- Correct timezone offset in date display

### Documentation
- Update API reference for v2 endpoints
```

## Options

- **Range**: Default is last tag to HEAD. Can specify custom range like `v1.0.0..v2.0.0`
- **Format**: Markdown (default), or plain text
- **Include authors**: Optionally append author to each entry
- **Include dates**: Optionally group by date
