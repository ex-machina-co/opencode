#!/usr/bin/env bun

/**
 * Publish patched @ex-machina packages:
 * - @ex-machina/opencode-sdk
 * - @ex-machina/opencode-plugin
 * - @ex-machina/opencode (CLI + all platform binaries)
 *
 * Delegates builds to the upstream scripts where possible, then renames
 * packages to @ex-machina/* scope before publishing.
 *
 * Reads version from PATCHED_VERSION file in repo root.
 * Usage: bun script/publish-patched.ts
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

console.log(`\n=== Publishing patched packages version: ${PATCHED_VERSION} ===\n`)

// Check if a version already exists on npm
async function exists(pkg: string, version: string) {
  try {
    const result = await $`npm view ${pkg}@${version} version`.quiet()
    return result.stdout.toString().trim() === version
  } catch {
    return false
  }
}

// Transforms export entries from ./src/*.ts to ./dist/*.{js,d.ts}
function transformExports(exports: Record<string, unknown>) {
  for (const [key, value] of Object.entries(exports)) {
    if (typeof value === "object" && value !== null) {
      transformExports(value as Record<string, unknown>)
    } else if (typeof value === "string") {
      const file = value.replace("./src/", "./dist/").replace(".ts", "")
      exports[key] = {
        import: file + ".js",
        types: file + ".d.ts",
      }
    }
  }
}

// ============ SDK ============

if (await exists("@ex-machina/opencode-sdk", PATCHED_VERSION)) {
  console.log(`Skip @ex-machina/opencode-sdk@${PATCHED_VERSION} (already published)\n`)
} else {
  console.log("=== Building and publishing @ex-machina/opencode-sdk ===\n")

  const dir = path.join(ROOT, "packages/sdk/js")
  process.chdir(dir)

  // Run the upstream SDK build (OpenAPI generation + tsc)
  await import("../packages/sdk/js/script/build.ts")

  // Read, modify, publish, restore
  const file = path.join(dir, "package.json")
  const original = await Bun.file(file).text()
  const pkg = JSON.parse(original)

  pkg.name = "@ex-machina/opencode-sdk"
  pkg.version = PATCHED_VERSION
  pkg.repository = { type: "git", url: "https://github.com/ex-machina-co/opencode" }
  delete pkg.devDependencies
  transformExports(pkg.exports)

  await Bun.write(file, JSON.stringify(pkg, null, 2))
  await $`bun pm pack`
  await $`npm publish *.tgz --tag latest --access public`
  await Bun.write(file, original)
  await $`rm -f *.tgz`

  console.log("\n  @ex-machina/opencode-sdk published\n")
}

// ============ Plugin ============

if (await exists("@ex-machina/opencode-plugin", PATCHED_VERSION)) {
  console.log(`Skip @ex-machina/opencode-plugin@${PATCHED_VERSION} (already published)\n`)
} else {
  console.log("=== Building and publishing @ex-machina/opencode-plugin ===\n")

  const dir = path.join(ROOT, "packages/plugin")
  process.chdir(dir)

  await $`bun tsc`

  const file = path.join(dir, "package.json")
  const original = await Bun.file(file).text()
  const pkg = JSON.parse(original)

  pkg.name = "@ex-machina/opencode-plugin"
  pkg.version = PATCHED_VERSION
  pkg.repository = { type: "git", url: "https://github.com/ex-machina-co/opencode" }
  pkg.dependencies = {
    "@ex-machina/opencode-sdk": PATCHED_VERSION,
    zod: pkg.dependencies?.zod ?? "catalog:",
  }
  delete pkg.devDependencies
  transformExports(pkg.exports)

  await Bun.write(file, JSON.stringify(pkg, null, 2))
  await $`bun pm pack`
  await $`npm publish *.tgz --tag latest --access public`
  await Bun.write(file, original)
  await $`rm -f *.tgz`

  console.log("\n  @ex-machina/opencode-plugin published\n")
}

// ============ CLI ============

console.log("=== Building and publishing @ex-machina/opencode CLI ===\n")

process.chdir(ROOT)
const { binaries, PATCHED_VERSION: version } = await import("./build-patched-cli.ts")

const distDir = path.join(ROOT, "packages/opencode/dist")

// Publish platform binary packages in parallel (use allSettled so one failure doesn't abort the rest)
const tasks = Object.entries(binaries).map(async ([name, ver]) => {
  if (await exists(name, ver as string)) {
    console.log(`  Skip ${name}@${ver} (already published)`)
    return
  }
  // Derive the directory name from the scoped package name
  // @ex-machina/opencode-darwin-arm64 → opencode-darwin-arm64
  const dirName = name.replace("@ex-machina/", "")
  const pkgDir = path.join(distDir, dirName)
  await $`chmod -R 755 .`.cwd(pkgDir).nothrow()
  await $`bun pm pack`.cwd(pkgDir)
  await $`npm publish *.tgz --access public --tag latest`.cwd(pkgDir)
  console.log(`  ${name}@${ver} published`)
})
const results = await Promise.allSettled(tasks)
const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
if (failures.length) {
  for (const f of failures) console.error("  Failed:", f.reason)
  console.error(
    `\n${failures.length} platform package(s) failed to publish. Re-run to retry (already-published packages will be skipped).`,
  )
  process.exit(1)
}

// Publish main @ex-machina/opencode wrapper
const mainPkg = "@ex-machina/opencode"
if (await exists(mainPkg, version)) {
  console.log(`\n  Skip ${mainPkg}@${version} (already published)\n`)
} else {
  const mainDir = path.join(distDir, "@ex-machina-opencode")
  await $`bun pm pack`.cwd(mainDir)
  await $`npm publish *.tgz --access public --tag latest`.cwd(mainDir)
  console.log(`\n  ${mainPkg}@${version} published\n`)
}

console.log(`\nDone! Published version ${PATCHED_VERSION}`)
console.log(`\nTo use the patched CLI:`)
console.log(`  npm install -g @ex-machina/opencode`)
console.log(`\nTo use in opencode-orca, update package.json:`)
console.log(`  "@opencode-ai/plugin": "npm:@ex-machina/opencode-plugin@${PATCHED_VERSION}",`)
console.log(`  "@opencode-ai/sdk": "npm:@ex-machina/opencode-sdk@${PATCHED_VERSION}",`)
