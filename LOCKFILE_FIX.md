# Pnpm Lockfile CI Fix

## The Issue

CI is failing with:
```
ERR_PNPM_LOCKFILE_CONFIG_MISMATCH  Cannot proceed with the frozen installation. 
The current "pnpmfileChecksum" configuration doesn't match the value found in the lockfile
```

## What This Means

The `pnpm-lock.yaml` file in your repository was generated with different pnpm configuration than what's currently set up. This happens when:
1. Package.json files have been modified
2. New dependencies added
3. pnpm workspace configuration changed

## The Fix

You need to regenerate and commit the lockfile:

```bash
# 1. Remove old lockfile
rm pnpm-lock.yaml

# 2. Regenerate with current config
pnpm install

# 3. Verify it works with frozen lockfile (what CI uses)
pnpm install --frozen-lockfile

# 4. Commit the new lockfile
git add pnpm-lock.yaml
git commit -m "chore: update pnpm-lock.yaml for e2e test dependencies"
```

## Current Status

Based on my checks:

```bash
$ pnpm install --frozen-lockfile
Already up to date ✅
Done in 1.8s
```

The lockfile appears to be correct locally. However, if CI is still failing, it means:

**The lockfile in your Git repository is out of sync with your local lockfile.**

## What To Do

### Option 1: Commit the Lockfile (if changes exist)

```bash
# Check if lockfile has changes
git diff pnpm-lock.yaml

# If there are changes, commit them
git add pnpm-lock.yaml
git commit -m "chore: update lockfile for e2e test dependencies"
git push
```

### Option 2: Force Regenerate on CI Branch

If you're working on a branch that was created before adding e2e dependencies:

```bash
# Ensure you're on the right branch
git checkout query-driven-sync  # or your e2e branch

# Force regenerate
rm pnpm-lock.yaml
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: regenerate lockfile with e2e dependencies"
git push
```

## Dependencies Added for E2E

The following new dependencies were added:

**`packages/db-collection-e2e/package.json`:**
- `pg@^8.13.1`
- `@types/pg@^8.11.10`

**`packages/electric-db-collection/package.json`:**
- `pg@^8.13.1` (devDependencies)
- `@types/pg@^8.11.10` (devDependencies)

These additions require the lockfile to be updated.

## Verification

After updating, verify with:

```bash
# This is what CI runs
pnpm install --frozen-lockfile

# Should output:
# "Already up to date" ✅
# NOT "ERR_PNPM_LOCKFILE_CONFIG_MISMATCH" ❌
```

## Note About Worktrees

You're working in a worktree on branch `refine-plane-flow-GdvW8`. The e2e tests should ideally be on the `query-driven-sync` branch as mentioned in the original plan.

If you need to move this work to the correct branch:

```bash
# Save current work
git add -A
git commit -m "feat: add e2e test suite"

# Switch to target branch
git checkout query-driven-sync

# Cherry-pick or merge
git cherry-pick refine-plane-flow-GdvW8
# or
git merge refine-plane-flow-GdvW8
```

---

**TL;DR**: The lockfile needs to be committed. Run `git add pnpm-lock.yaml` and `git commit` to include it in your PR.

