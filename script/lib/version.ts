/**
 * Version parsing and manipulation for patched packages
 *
 * Format: {major}.{minor}.{basePatch * 1000 + patchNumber}
 * Example: base 1.2.27, patch 1 → 1.2.27001
 *
 * The 1000x multiplier on the upstream patch digit creates a
 * collision-free version space while keeping a visual link to
 * the upstream release the fork is based on.
 */

export interface PatchedVersion {
  base: string // e.g., "1.2.27"
  patch: number // e.g., 1
}

const MULTIPLIER = 1000
const OLD_SUFFIX = "-exmachina."

export function parsePatchedVersion(version: string): PatchedVersion {
  const parts = version.split(".")
  if (parts.length !== 3) {
    throw new Error(`Invalid patched version format: ${version} (expected major.minor.patch)`)
  }
  const combined = Number.parseInt(parts[2]!, 10)
  if (isNaN(combined)) {
    throw new Error(`Invalid patch number in version: ${version}`)
  }
  const base = Math.floor(combined / MULTIPLIER)
  const patch = combined % MULTIPLIER
  return { base: `${parts[0]}.${parts[1]}.${base}`, patch }
}

export function formatPatchedVersion(v: PatchedVersion): string {
  const parts = v.base.split(".")
  const base = Number.parseInt(parts[2]!, 10)
  return `${parts[0]}.${parts[1]}.${base * MULTIPLIER + v.patch}`
}

export function resetToNewBase(base: string): PatchedVersion {
  return { base, patch: 1 }
}

export function bumpPatch(v: PatchedVersion): PatchedVersion {
  return { base: v.base, patch: v.patch + 1 }
}

/**
 * Returns true if version `a` is strictly newer than version `b`.
 *
 * Handles the transition from old `-exmachina.N` format:
 * if either version uses the old format, we fall back to
 * treating any new-format version as newer than any old-format
 * version (since the format switch itself is a forward move).
 */
export function isNewer(a: string, b: string): boolean {
  const aOld = a.includes(OLD_SUFFIX)
  const bOld = b.includes(OLD_SUFFIX)

  // Both new format — compare as semver triplets
  if (!aOld && !bOld) {
    const pa = a.split(".").map(Number) as [number, number, number]
    const pb = b.split(".").map(Number) as [number, number, number]
    for (let i = 0; i < 3; i++) {
      if (pa[i]! > pb[i]!) return true
      if (pa[i]! < pb[i]!) return false
    }
    return false
  }

  // Transition: new format is always newer than old format
  if (!aOld && bOld) return true
  if (aOld && !bOld) return false

  // Both old format — compare using the old logic
  const va = parseOld(a)
  const vb = parseOld(b)
  const pa = va.base.split(".").map(Number) as [number, number, number]
  const pb = vb.base.split(".").map(Number) as [number, number, number]
  for (let i = 0; i < 3; i++) {
    if (pa[i]! > pb[i]!) return true
    if (pa[i]! < pb[i]!) return false
  }
  return va.patch > vb.patch
}

/** Parse the legacy `-exmachina.N` format. */
function parseOld(version: string): PatchedVersion {
  const idx = version.indexOf(OLD_SUFFIX)
  if (idx === -1) throw new Error(`Not an old-format version: ${version}`)
  return {
    base: version.slice(0, idx),
    patch: Number.parseInt(version.slice(idx + OLD_SUFFIX.length), 10),
  }
}
