#!/usr/bin/env bun

/**
 * Sync fork with upstream and update patched version if needed
 *
 * Usage: bun script/sync.ts [--dry-run]
 *
 * This script:
 * 1. Fetches latest from base/dev (upstream)
 * 2. Updates local dev branch to match base/dev, pushes to origin
 * 3. Merges dev into main (aborts on conflicts)
 * 4. If upstream version changed, bumps PATCHED_VERSION to {newVersion}-exmachina.1
 * 5. Commits and pushes main
 */

import path from 'path'
import {
  checkout,
  commitAll,
  fetch,
  getCurrentBranch,
  getFileContent,
  hasUncommittedChanges,
  merge,
  push,
  resetHardTo,
  writeFile,
} from './lib/git'
import { formatPatchedVersion, parsePatchedVersion, resetToNewBase } from './lib/version'

const ROOT = path.resolve(import.meta.dir, '..')
const PATCHED_VERSION_FILE = path.join(ROOT, 'PATCHED_VERSION')
const OPENCODE_PACKAGE_JSON = path.join(ROOT, 'packages/opencode/package.json')

const dryRun = process.argv.includes('--dry-run')

function log(msg: string) {
  console.log(msg)
}

function dryLog(msg: string) {
  if (dryRun) {
    console.log(`[DRY RUN] ${msg}`)
  }
}

async function getUpstreamVersion(): Promise<string> {
  const content = await getFileContent(OPENCODE_PACKAGE_JSON)
  const pkg = JSON.parse(content)
  return pkg.version
}

async function main() {
  log('\n=== Sync Fork ===\n')

  // Check for uncommitted changes
  if (await hasUncommittedChanges()) {
    console.error('Error: You have uncommitted changes. Please commit or stash them first.')
    process.exit(1)
  }

  const originalBranch = await getCurrentBranch()

  // Read current patched version
  const currentPatchedVersion = (await getFileContent(PATCHED_VERSION_FILE)).trim()
  const parsed = parsePatchedVersion(currentPatchedVersion)
  log(`Current patched version: ${currentPatchedVersion}`)
  log(`  Base: ${parsed.base}, Patch: ${parsed.patch}`)

  // Step 1: Fetch upstream
  log('\n1. Fetching upstream (base)...')
  if (!dryRun) {
    await fetch('base')
  } else {
    dryLog('Would fetch base remote')
  }
  log('   Done.')

  // Step 2: Update dev branch to match base/dev
  log('\n2. Updating dev branch...')
  if (!dryRun) {
    await checkout('dev')
    await resetHardTo('base/dev')
    await push('origin', 'dev', '--no-verify')
  } else {
    dryLog('Would checkout dev')
    dryLog('Would reset dev to base/dev')
    dryLog('Would push dev to origin')
  }
  log('   Done. dev now mirrors base/dev')

  // Step 3: Merge dev into main
  log('\n3. Merging dev into main...')
  if (!dryRun) {
    await checkout('main')
    try {
      await merge('dev')
    } catch (error) {
      console.error('\nError: Merge conflict! Please resolve manually:')
      console.error('  1. Fix the conflicts')
      console.error('  2. git add . && git commit')
      console.error('  3. Run this script again (or manually update PATCHED_VERSION if needed)')
      process.exit(1)
    }
  } else {
    dryLog('Would checkout main')
    dryLog('Would merge dev into main')
  }
  log('   Done.')

  // Step 4: Check if upstream version changed
  log('\n4. Checking version...')
  const upstreamVersion = await getUpstreamVersion()
  log(`   Upstream version: ${upstreamVersion}`)
  log(`   Current base: ${parsed.base}`)

  if (upstreamVersion !== parsed.base) {
    // Version changed - update PATCHED_VERSION
    const newPatched = resetToNewBase(upstreamVersion)
    const newVersion = formatPatchedVersion(newPatched)
    log(`\n   Version changed! Bumping: ${currentPatchedVersion} -> ${newVersion}`)

    if (!dryRun) {
      await writeFile(PATCHED_VERSION_FILE, newVersion + '\n')
      await commitAll(`chore: bump patched version to ${newVersion}`)
    } else {
      dryLog(`Would write ${newVersion} to PATCHED_VERSION`)
      dryLog(`Would commit with message: chore: bump patched version to ${newVersion}`)
    }
  } else {
    log('   Version unchanged. No PATCHED_VERSION update needed.')
  }

  // Step 5: Push main
  log('\n5. Pushing main...')
  if (!dryRun) {
    await push('origin', 'main', '--no-verify')
  } else {
    dryLog('Would push main to origin')
  }
  log('   Done.')

  // Return to original branch
  if (!dryRun && originalBranch !== 'main') {
    await checkout(originalBranch)
    log(`\nReturned to ${originalBranch} branch.`)
  }

  log('\n=== Sync Complete ===')

  if (upstreamVersion !== parsed.base) {
    log(
      `\nGitHub Actions will publish @ex-machina packages version ${formatPatchedVersion(resetToNewBase(upstreamVersion))}`,
    )
  } else {
    log('\nNo version update - CI will not publish.')
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err.message)
  process.exit(1)
})
