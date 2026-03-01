#!/usr/bin/env bun

/**
 * Verify all patched @ex-machina packages exist at the correct version.
 *
 * Retries with delays to handle npm registry propagation lag — packages
 * are confirmed published but may not be queryable via `npm view` for
 * 10-30 seconds after publish completes.
 *
 * Requires build to have run first (dist/ must exist to discover packages).
 *
 * Usage: bun script/verify-publish.ts
 */

import { allPackages, PATCHED_VERSION } from "./lib/packages"
import { versionExists } from "./lib/npm"
import { io } from "./lib/io"

const INITIAL_DELAY_MS = 15_000
const RETRY_DELAY_MS = 15_000
const MAX_RETRIES = 4

export async function main() {
  io.log(`\n=== Verifying packages at version ${PATCHED_VERSION} ===\n`)

  const packages = await allPackages()

  io.log(`Waiting ${INITIAL_DELAY_MS / 1000}s for registry propagation...`)
  await io.sleep(INITIAL_DELAY_MS)

  let missing = packages.slice()

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      io.log(
        `\nRetry ${attempt}/${MAX_RETRIES} — rechecking ${missing.length} package(s) in ${RETRY_DELAY_MS / 1000}s...`,
      )
      await io.sleep(RETRY_DELAY_MS)
    }

    const results = await Promise.all(
      missing.map(async (pkg) => ({
        pkg,
        ok: await versionExists(pkg, PATCHED_VERSION),
      })),
    )

    const still = results.filter((r) => !r.ok).map((r) => r.pkg)
    const found = results.filter((r) => r.ok).map((r) => r.pkg)

    for (const pkg of found) io.log(`  ok ${pkg}@${PATCHED_VERSION}`)
    for (const pkg of still) io.log(`  MISSING ${pkg}@${PATCHED_VERSION}`)

    missing = still
    if (missing.length === 0) break
  }

  if (missing.length) {
    io.error(`\n${missing.length} of ${packages.length} packages still missing after ${MAX_RETRIES} retries.`)
    return 1
  }

  io.log(`\n=== All ${packages.length} packages verified ===`)
  return 0
}

if (import.meta.main) {
  process.exit(await main())
}
