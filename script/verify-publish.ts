#!/usr/bin/env bun

/**
 * Verify all patched @ex-machina packages exist at the correct version.
 *
 * Requires build to have run first (dist/ must exist to discover packages).
 *
 * Usage: bun script/verify-publish.ts
 */

import { allPackages, PATCHED_VERSION } from "./lib/packages"
import { versionExists } from "./lib/npm"

export async function main() {
  console.log(`\n=== Verifying packages at version ${PATCHED_VERSION} ===\n`)

  const packages = await allPackages()
  const results = await Promise.all(
    packages.map(async (pkg) => ({
      pkg,
      ok: await versionExists(pkg, PATCHED_VERSION),
    })),
  )

  const missing = results.filter((r) => !r.ok)

  for (const r of results) {
    console.log(`  ${r.ok ? "ok" : "MISSING"} ${r.pkg}@${PATCHED_VERSION}`)
  }

  if (missing.length) {
    console.error(`\n${missing.length} of ${packages.length} packages missing. Re-run publish.`)
    return 1
  }

  console.log(`\n=== All ${packages.length} packages verified ===`)
  return 0
}

if (import.meta.main) {
  process.exit(await main())
}
