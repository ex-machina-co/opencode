#!/usr/bin/env bun

/**
 * Build patched @ex-machina/opencode CLI binaries for all platforms.
 *
 * Delegates to the upstream build script (packages/opencode/script/build.ts)
 * which handles migrations, models-snapshot, worker paths, and all platform
 * targets. After building, renames packages from opencode-* to @ex-machina/opencode-*.
 *
 * Then creates the main @ex-machina/opencode wrapper package with postinstall
 * and bin wrapper adapted for the @ex-machina scope.
 *
 * Usage: bun script/build-patched-cli.ts
 */

import path from "path"
import { $ } from "bun"

const ROOT = path.resolve(import.meta.dir, "..")
const OPENCODE_DIR = path.join(ROOT, "packages/opencode")
const PATCHED_VERSION = (await Bun.file(path.join(ROOT, "PATCHED_VERSION")).text()).trim()

if (!PATCHED_VERSION) {
  console.error("Error: PATCHED_VERSION file is empty")
  process.exit(1)
}

console.log(`\nBuilding patched CLI version: ${PATCHED_VERSION}\n`)

// Configure the upstream Script module via env vars
process.env.OPENCODE_VERSION = PATCHED_VERSION
process.env.OPENCODE_CHANNEL = "latest"

// Force all-platform build even in CI (upstream defaults to --single in CI)
process.argv.push("--all")

// Run the upstream build (handles migrations, models-snapshot, all platforms, defines)
await import("../packages/opencode/script/build.ts")

// Rename dist packages from opencode-* to @ex-machina/opencode-*
const distDir = path.join(OPENCODE_DIR, "dist")
const binaries: Record<string, string> = {}

for await (const filepath of new Bun.Glob("*/package.json").scan({ cwd: distDir })) {
  const file = path.join(distDir, filepath)
  const pkg = await Bun.file(file).json()
  const scoped = `@ex-machina/${pkg.name}`
  pkg.name = scoped
  pkg.repository = {
    type: "git",
    url: "https://github.com/ex-machina-co/opencode",
  }
  await Bun.write(file, JSON.stringify(pkg, null, 2))
  binaries[scoped] = pkg.version
  console.log(`  Renamed to ${scoped}`)
}

// Create main @ex-machina/opencode wrapper package
console.log(`\nCreating main @ex-machina/opencode package...`)

const mainDir = path.join(distDir, "@ex-machina-opencode")
await $`mkdir -p ${mainDir}/bin`

// Copy and adapt bin wrapper for @ex-machina scope
// The upstream wrapper looks for "opencode-<platform>-<arch>" in node_modules.
// We need it to look for "@ex-machina/opencode-<platform>-<arch>" instead.
const binSrc = await Bun.file(path.join(OPENCODE_DIR, "bin/opencode")).text()
const binWrapper = binSrc.replace(
  'const base = "opencode-" + platform + "-" + arch',
  'const base = "@ex-machina/opencode-" + platform + "-" + arch',
)
await Bun.write(path.join(mainDir, "bin/opencode"), binWrapper)
await $`chmod +x ${mainDir}/bin/opencode`

// Copy and adapt postinstall for @ex-machina scope
const postinstallSrc = await Bun.file(path.join(OPENCODE_DIR, "script/postinstall.mjs")).text()
const postinstall = postinstallSrc.replace(
  "const packageName = `opencode-${platform}-${arch}`",
  "const packageName = `@ex-machina/opencode-${platform}-${arch}`",
)
await Bun.write(path.join(mainDir, "postinstall.mjs"), postinstall)

// Copy LICENSE
const licensePath = path.join(ROOT, "LICENSE")
if (await Bun.file(licensePath).exists()) {
  await Bun.write(path.join(mainDir, "LICENSE"), await Bun.file(licensePath).text())
}

await Bun.write(
  path.join(mainDir, "package.json"),
  JSON.stringify(
    {
      name: "@ex-machina/opencode",
      version: PATCHED_VERSION,
      description: "Patched opencode CLI with additional features",
      license: "MIT",
      bin: { opencode: "./bin/opencode" },
      scripts: {
        postinstall: "bun ./postinstall.mjs || node ./postinstall.mjs",
      },
      optionalDependencies: binaries,
      repository: {
        type: "git",
        url: "https://github.com/ex-machina-co/opencode",
      },
    },
    null,
    2,
  ),
)

console.log(`  Created @ex-machina/opencode\n`)
console.log(`Build complete! Output in ${distDir}`)
console.log(`\nPackages built:`)
console.log(`  - @ex-machina/opencode@${PATCHED_VERSION}`)
for (const name of Object.keys(binaries)) {
  console.log(`  - ${name}@${PATCHED_VERSION}`)
}

export { binaries, PATCHED_VERSION }
