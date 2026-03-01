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
 *   a. Builds CLI to discover platform targets, checks npm for new packages.
 *   b. If new packages found: publishes placeholders, prints OIDC setup
        instructions, and exits. Re-run after configuring OIDC.
 * 4. If upstream version changed, bumps PATCHED_VERSION to {newVersion}-exmachina.1
 * 5. Commits and pushes main
 */

import path from "path"
import readline from "readline"
import { io } from "./lib/io"
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
} from "./lib/git"
import { packageExists, publishPlaceholder, versionExists, whoami } from "./lib/npm"
import { formatPatchedVersion, parsePatchedVersion, resetToNewBase } from "./lib/version"

const ROOT = path.resolve(import.meta.dir, "..")
const PATCHED_VERSION_FILE = path.join(ROOT, "PATCHED_VERSION")
const OPENCODE_PACKAGE_JSON = path.join(ROOT, "packages/opencode/package.json")

const dryRun = process.argv.includes("--dry-run")

function log(msg: string) {
  console.log(msg)
}

function dryLog(msg: string) {
  if (dryRun) {
    console.log(`[DRY RUN] ${msg}`)
  }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

const OIDC_REPO = "ex-machina-co/opencode"
const OIDC_WORKFLOW = "publish-patched.yml"

function printOidcInstructions(packages: string[]) {
  log("\n   Configure OIDC trusted publishing for each new package:")
  for (const pkg of packages) {
    log(`\n   ${pkg}`)
    log(`     → https://www.npmjs.com/package/${pkg}/access`)
    log(`       Repository:  ${OIDC_REPO}`)
    log(`       Workflow:    ${OIDC_WORKFLOW}`)
    log(`       Environment: (leave blank)`)
  }
}

const SCOPE = "@ex-machina"
const DIST_DIR = path.join(ROOT, "packages/opencode/dist")

/**
 * Run the patched CLI build, then scan dist/ to discover all @ex-machina/*
 * binary package names. Returns the full list of expected package names
 * (binaries + SDK + plugin + wrapper).
 */
async function buildAndDiscoverPackages(): Promise<string[]> {
  log("   Running build to discover platform targets (~30s)...")
  const { binaries } = await import("./build-patched-cli.ts")
  // binaries is Record<string, string> e.g. { "@ex-machina/opencode-darwin-arm64": "1.2.15-exmachina.1" }
  return [
    `${SCOPE}/opencode-sdk`,
    `${SCOPE}/opencode-plugin`,
    ...Object.keys(binaries),
    `${SCOPE}/opencode`, // wrapper last
  ]
}

async function cleanupDist() {
  await io.rm(DIST_DIR)
}

/**
 * Check for new platform targets that don't exist in npm yet.
 * Runs the build to discover package names, then checks npm.
 * If new packages are found, publishes placeholders and stops for OIDC setup.
 * Returns true if sync should continue, false if it should stop.
 */
async function bootstrapNewPackages(): Promise<boolean> {
  log("\n3.5. Checking for new platform targets...")

  let expected: string[]
  try {
    expected = await buildAndDiscoverPackages()
  } catch (err) {
    console.error("   Build failed:", (err as Error).message)
    await cleanupDist()
    process.exit(1)
  }

  log(`\n   Discovered ${expected.length} packages. Checking npm registry...`)

  // Check all packages in parallel
  const results = await Promise.all(
    expected.map(async (pkg) => ({
      pkg,
      exists: await packageExists(pkg),
    })),
  )

  const missing = results.filter((r) => !r.exists).map((r) => r.pkg)

  // Also check for placeholders from a previous interrupted sync
  const placeholders: string[] = []
  if (missing.length === 0) {
    const checks = await Promise.all(
      results
        .filter((r) => r.exists)
        .map(async (r) => ({
          pkg: r.pkg,
          isPlaceholder: await versionExists(r.pkg, "0.0.0-exmachina.0"),
        })),
    )
    for (const c of checks) {
      if (c.isPlaceholder) placeholders.push(c.pkg)
    }
  }

  await cleanupDist()

  if (missing.length === 0 && placeholders.length === 0) {
    log("   All packages exist in npm. Continuing.")
    return true
  }

  if (missing.length === 0 && placeholders.length > 0) {
    // Packages were bootstrapped previously but might not have OIDC configured
    log(`\n   Found ${placeholders.length} package(s) bootstrapped with placeholder versions:`)
    for (const pkg of placeholders) log(`     - ${pkg}`)

    const answer = await prompt("\n   Have you configured OIDC trusted publishing for these? [y/N] ")
    if (answer === "y" || answer === "yes") {
      log("   Continuing with sync.")
      return true
    }
    printOidcInstructions(placeholders)
    log("\n   Run `bun sync` again after configuring OIDC.")
    return false
  }

  // New packages found — need to publish placeholders
  log(`\n   Found ${missing.length} new package(s) not yet in npm:`)
  for (const pkg of missing) log(`     - ${pkg}`)

  if (dryRun) {
    dryLog("Would publish placeholder packages and stop for OIDC setup")
    return false
  }

  // Check npm login
  const user = await whoami()
  if (!user) {
    log("\n   You need to be logged in to npm to publish placeholders.")
    log("   Run `npm login` first, then re-run `bun sync`.")
    return false
  }
  log(`\n   Logged in to npm as: ${user}`)
  log("   Publishing placeholder packages...\n")

  for (const pkg of missing) {
    try {
      await publishPlaceholder(pkg)
      log(`   + ${pkg}@0.0.0-exmachina.0`)
    } catch (err) {
      console.error(`   x Failed to publish ${pkg}:`, (err as Error).message)
      log("\n   Fix the error and re-run `bun sync`.")
      return false
    }
  }

  log("\n   Placeholder packages published successfully!")
  printOidcInstructions(missing)
  log("\n   Run `bun sync` again after configuring OIDC.")
  return false
}

async function getUpstreamVersion(): Promise<string> {
  const content = await getFileContent(OPENCODE_PACKAGE_JSON)
  const pkg = JSON.parse(content)
  return pkg.version
}

async function main() {
  log("\n=== Sync Fork ===\n")

  // Check for uncommitted changes
  if (await hasUncommittedChanges()) {
    console.error("Error: You have uncommitted changes. Please commit or stash them first.")
    process.exit(1)
  }

  const originalBranch = await getCurrentBranch()

  // Read current patched version
  const currentPatchedVersion = (await getFileContent(PATCHED_VERSION_FILE)).trim()
  const parsed = parsePatchedVersion(currentPatchedVersion)
  log(`Current patched version: ${currentPatchedVersion}`)
  log(`  Base: ${parsed.base}, Patch: ${parsed.patch}`)

  // Step 1: Fetch upstream
  log("\n1. Fetching upstream (base)...")
  if (!dryRun) {
    await fetch("base")
  } else {
    dryLog("Would fetch base remote")
  }
  log("   Done.")

  // Step 2: Update dev branch to match base/dev
  log("\n2. Updating dev branch...")
  if (!dryRun) {
    await checkout("dev")
    await resetHardTo("base/dev")
    await push("origin", "dev", { tags: true, noVerify: true })
  } else {
    dryLog("Would checkout dev")
    dryLog("Would reset dev to base/dev")
    dryLog("Would push dev to origin")
  }
  log("   Done. dev now mirrors base/dev")

  // Step 3: Merge dev into main
  log("\n3. Merging dev into main...")
  if (!dryRun) {
    await checkout("main")
    try {
      await merge("dev")
    } catch (error) {
      console.error("\nError: Merge conflict! Please resolve manually:")
      console.error("  1. Fix the conflicts")
      console.error("  2. git add . && git commit")
      console.error("  3. Run this script again (or manually update PATCHED_VERSION if needed)")
      process.exit(1)
    }
  } else {
    dryLog("Would checkout main")
    dryLog("Would merge dev into main")
  }
  log("   Done.")

  // Step 3.5: Check for new platform targets and bootstrap if needed
  const shouldContinue = await bootstrapNewPackages()
  if (!shouldContinue) {
    // Return to original branch before exiting
    if (!dryRun && originalBranch !== "main") {
      await checkout(originalBranch)
    }
    process.exit(0)
  }

  // Step 4: Check if upstream version changed
  log("\n4. Checking version...")
  const upstreamVersion = await getUpstreamVersion()
  log(`   Upstream version: ${upstreamVersion}`)
  log(`   Current base: ${parsed.base}`)

  if (upstreamVersion !== parsed.base) {
    // Version changed - update PATCHED_VERSION
    const newPatched = resetToNewBase(upstreamVersion)
    const newVersion = formatPatchedVersion(newPatched)
    log(`\n   Version changed! Bumping: ${currentPatchedVersion} -> ${newVersion}`)

    if (!dryRun) {
      await writeFile(PATCHED_VERSION_FILE, newVersion + "\n")
      await commitAll(`chore: bump patched version to ${newVersion}`)
    } else {
      dryLog(`Would write ${newVersion} to PATCHED_VERSION`)
      dryLog(`Would commit with message: chore: bump patched version to ${newVersion}`)
    }
  } else {
    log("   Version unchanged. No PATCHED_VERSION update needed.")
  }

  // Step 5: Push main
  log("\n5. Pushing main...")
  if (!dryRun) {
    await push("origin", "main", { noVerify: true })
  } else {
    dryLog("Would push main to origin")
  }
  log("   Done.")

  // Return to original branch
  if (!dryRun && originalBranch !== "main") {
    await checkout(originalBranch)
    log(`\nReturned to ${originalBranch} branch.`)
  }

  log("\n=== Sync Complete ===")

  if (upstreamVersion !== parsed.base) {
    log(
      `\nGitHub Actions will publish @ex-machina packages version ${formatPatchedVersion(resetToNewBase(upstreamVersion))}`,
    )
  } else {
    log("\nNo version update - CI will not publish.")
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err.message)
  process.exit(1)
})
