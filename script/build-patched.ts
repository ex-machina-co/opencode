#!/usr/bin/env bun

/**
 * Build all patched @ex-machina packages (compilation only, no publishing).
 *
 * - SDK: OpenAPI generation + tsc
 * - Plugin: tsc
 * - CLI: Bun.build for all 11 platform targets + wrapper package
 *
 * Usage: bun script/build-patched.ts
 */

import path from "path"
import { $ } from "bun"

const ROOT = path.resolve(import.meta.dir, "..")
const PATCHED_VERSION = (await Bun.file(path.join(ROOT, "PATCHED_VERSION")).text()).trim()

if (!PATCHED_VERSION) {
  console.error("Error: PATCHED_VERSION file is empty")
  process.exit(1)
}

// Configure the upstream Script module via env vars
process.env.OPENCODE_VERSION = PATCHED_VERSION
process.env.OPENCODE_CHANNEL = "latest"

console.log(`\n=== Building patched packages version: ${PATCHED_VERSION} ===\n`)

// --- SDK ---
console.log("Building @ex-machina/opencode-sdk...")
process.chdir(path.join(ROOT, "packages/sdk/js"))
await import("../packages/sdk/js/script/build.ts")
console.log("  SDK build complete.\n")

// --- Plugin ---
console.log("Building @ex-machina/opencode-plugin...")
process.chdir(path.join(ROOT, "packages/plugin"))
await $`bun tsc`
console.log("  Plugin build complete.\n")

// --- CLI (all platform binaries + wrapper) ---
console.log("Building @ex-machina/opencode CLI (all platforms)...")
process.chdir(ROOT)
await import("./build-patched-cli.ts")
console.log("  CLI build complete.\n")

console.log(`=== All builds complete for version ${PATCHED_VERSION} ===`)
