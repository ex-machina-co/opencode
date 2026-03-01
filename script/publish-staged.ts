#!/usr/bin/env bun

/**
 * Publish all patched @ex-machina packages with --tag staging.
 *
 * Requires build to have run first (dist/ must exist, SDK/plugin must be compiled).
 * Already-published versions are skipped (idempotent for retries).
 *
 * Usage: bun script/publish-staged.ts
 */

import path from "path"
import { transformExports } from "./lib/exports"
import { io } from "./lib/io"
import { versionExists } from "./lib/npm"
import { allPackages, PATCHED_VERSION } from "./lib/packages"

const ROOT = path.resolve(import.meta.dir, "..")
const DIST_DIR = path.join(ROOT, "packages/opencode/dist")

async function publishSdk() {
  if (await versionExists("@ex-machina/opencode-sdk", PATCHED_VERSION)) {
    console.log(`  Skip @ex-machina/opencode-sdk@${PATCHED_VERSION} (already published)`)
    return
  }

  const dir = path.join(ROOT, "packages/sdk/js")
  const file = path.join(dir, "package.json")
  const original = await io.readFile(file)
  const pkg = JSON.parse(original)

  pkg.name = "@ex-machina/opencode-sdk"
  pkg.version = PATCHED_VERSION
  pkg.repository = { type: "git", url: "https://github.com/ex-machina-co/opencode" }
  delete pkg.devDependencies
  transformExports(pkg.exports)

  await io.writeFile(file, JSON.stringify(pkg, null, 2))
  try {
    await io.pack(dir)
    await io.publish(dir, "staging")
    console.log(`  @ex-machina/opencode-sdk@${PATCHED_VERSION} published (staging)`)
  } finally {
    await io.writeFile(file, original)
    await io.rm(path.join(dir, "*.tgz"))
  }
}

async function publishPlugin() {
  if (await versionExists("@ex-machina/opencode-plugin", PATCHED_VERSION)) {
    console.log(`  Skip @ex-machina/opencode-plugin@${PATCHED_VERSION} (already published)`)
    return
  }

  const dir = path.join(ROOT, "packages/plugin")
  const file = path.join(dir, "package.json")
  const original = await io.readFile(file)
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

  await io.writeFile(file, JSON.stringify(pkg, null, 2))
  try {
    await io.pack(dir)
    await io.publish(dir, "staging")
    console.log(`  @ex-machina/opencode-plugin@${PATCHED_VERSION} published (staging)`)
  } finally {
    await io.writeFile(file, original)
    await io.rm(path.join(dir, "*.tgz"))
  }
}

async function publishBinaries(packages: string[]) {
  const binaries = packages.filter(
    (p) => p !== "@ex-machina/opencode-sdk" && p !== "@ex-machina/opencode-plugin" && p !== "@ex-machina/opencode",
  )

  const tasks = binaries.map(async (name) => {
    if (await versionExists(name, PATCHED_VERSION)) {
      console.log(`  Skip ${name}@${PATCHED_VERSION} (already published)`)
      return
    }
    const dirName = name.replace("@ex-machina/", "")
    const pkgDir = path.join(DIST_DIR, dirName)
    await io.chmod(pkgDir)
    await io.pack(pkgDir)
    await io.publish(pkgDir, "staging")
    console.log(`  ${name}@${PATCHED_VERSION} published (staging)`)
  })

  const results = await Promise.allSettled(tasks)
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
  if (failures.length) {
    for (const f of failures) console.error("  Failed:", f.reason)
    throw new Error(`${failures.length} platform package(s) failed to publish`)
  }
}

async function publishWrapper() {
  if (await versionExists("@ex-machina/opencode", PATCHED_VERSION)) {
    console.log(`  Skip @ex-machina/opencode@${PATCHED_VERSION} (already published)`)
    return
  }
  const mainDir = path.join(DIST_DIR, "@ex-machina-opencode")
  await io.pack(mainDir)
  await io.publish(mainDir, "staging")
  console.log(`  @ex-machina/opencode@${PATCHED_VERSION} published (staging)`)
}

export async function main() {
  console.log(`\n=== Publishing to staging: ${PATCHED_VERSION} ===\n`)

  await publishSdk()
  await publishPlugin()

  const packages = await allPackages()
  await publishBinaries(packages)
  await publishWrapper()

  console.log(`\n=== All packages published to staging ===`)
  return 0
}

if (import.meta.main) {
  const code = await main().catch((err) => {
    console.error(err.message)
    return 1
  })
  process.exit(code)
}
