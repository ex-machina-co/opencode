#!/usr/bin/env bun

/**
 * Promote all patched @ex-machina packages from staging to latest.
 *
 * Flips the `latest` dist-tag to point at the current PATCHED_VERSION.
 * This is a metadata-only operation (no uploads), so it's near-instant.
 *
 * Requires build to have run first (dist/ must exist to discover packages).
 *
 * Usage: bun script/promote-publish.ts
 */

import { allPackages, PATCHED_VERSION } from "./lib/packages"
import { distTagAdd } from "./lib/npm"

export async function main() {
  console.log(`\n=== Promoting ${PATCHED_VERSION} to latest ===\n`)

  const packages = await allPackages()
  const results = await Promise.allSettled(
    packages.map(async (pkg) => {
      await distTagAdd(pkg, PATCHED_VERSION, "latest")
      console.log(`  ${pkg}@${PATCHED_VERSION} -> latest`)
    }),
  )

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
  if (failures.length) {
    for (const f of failures) console.error("  Failed:", f.reason)
    console.error(`\n${failures.length} of ${packages.length} packages failed to promote. Re-run to retry.`)
    return 1
  }

  console.log(`\n=== All ${packages.length} packages promoted to latest ===`)
  console.log(`\nTo use the patched CLI:`)
  console.log(`  npm install -g @ex-machina/opencode`)
  console.log(`\nTo use in opencode-orca, update package.json:`)
  console.log(`  "@opencode-ai/plugin": "npm:@ex-machina/opencode-plugin@${PATCHED_VERSION}",`)
  console.log(`  "@opencode-ai/sdk": "npm:@ex-machina/opencode-sdk@${PATCHED_VERSION}",`)
  return 0
}

if (import.meta.main) {
  process.exit(await main())
}
