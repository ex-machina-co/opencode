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
import { distTagAdd, latestVersion } from "./lib/npm"
import { isNewer } from "./lib/version"
import { io } from "./lib/io"

export async function main() {
  io.log(`\n=== Promoting ${PATCHED_VERSION} to latest ===\n`)

  const current = await latestVersion("@ex-machina/opencode")
  if (current) {
    try {
      if (!isNewer(PATCHED_VERSION, current)) {
        io.log(`Skipping: ${PATCHED_VERSION} is not newer than current latest ${current}`)
        return 0
      }
    } catch {
      // current latest isn't in exmachina format — proceed with promotion
    }
  }

  const packages = await allPackages()
  const results = await Promise.allSettled(
    packages.map(async (pkg) => {
      await distTagAdd(pkg, PATCHED_VERSION, "latest")
      io.log(`  ${pkg}@${PATCHED_VERSION} -> latest`)
    }),
  )

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
  if (failures.length) {
    for (const f of failures) io.error("  Failed:", f.reason)
    io.error(`\n${failures.length} of ${packages.length} packages failed to promote. Re-run to retry.`)
    return 1
  }

  io.log(`\n=== All ${packages.length} packages promoted to latest ===`)
  io.log(`\nTo use the patched CLI:`)
  io.log(`  npm install -g @ex-machina/opencode`)
  io.log(`\nTo use in opencode-orca, update package.json:`)
  io.log(`  "@opencode-ai/plugin": "npm:@ex-machina/opencode-plugin@${PATCHED_VERSION}",`)
  io.log(`  "@opencode-ai/sdk": "npm:@ex-machina/opencode-sdk@${PATCHED_VERSION}",`)
  return 0
}

if (import.meta.main) {
  process.exit(await main())
}
