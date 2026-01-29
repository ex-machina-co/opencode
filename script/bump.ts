#!/usr/bin/env bun
/**
 * Bumps the patch number in PATCHED_VERSION, commits, and pushes.
 * Usage: bun script/bump.ts [--dry-run]
 */

import path from "node:path"
import { parsePatchedVersion, formatPatchedVersion, bumpPatch } from "./lib/version"

const ROOT = path.resolve(import.meta.dirname, "..")
const PATCHED_VERSION_FILE = path.join(ROOT, "PATCHED_VERSION")
const dry = process.argv.includes("--dry-run")

const log = (msg: string) => console.log(dry ? `[DRY RUN] ${msg}` : msg)

// 1. Read and bump
const current = (await Bun.file(PATCHED_VERSION_FILE).text()).trim()
const bumped = formatPatchedVersion(bumpPatch(parsePatchedVersion(current)))
log(`Bump: ${current} → ${bumped}`)

// 2. Write new version
if (!dry) {
  await Bun.write(PATCHED_VERSION_FILE, bumped + "\n")
}

// 3. Commit and push
if (!dry) {
  const commit = Bun.spawnSync(["git", "commit", "-am", `chore: bump to ${bumped}`], { cwd: ROOT })
  if (commit.exitCode !== 0) {
    console.error("Commit failed:", commit.stderr.toString())
    process.exit(1)
  }

  const push = Bun.spawnSync(["git", "push"], { cwd: ROOT })
  if (push.exitCode !== 0) {
    console.error("Push failed:", push.stderr.toString())
    process.exit(1)
  }
}

log("Done!")
