/**
 * Version parsing and manipulation for patched packages
 *
 * Format: {baseVersion}-exmachina.{patchNumber}
 * Example: 1.1.25-exmachina.4
 */

export interface PatchedVersion {
  base: string // e.g., "1.1.25"
  patch: number // e.g., 4
}

const SUFFIX = "-exmachina."

export function parsePatchedVersion(version: string): PatchedVersion {
  const idx = version.indexOf(SUFFIX)
  if (idx === -1) {
    throw new Error(`Invalid patched version format: ${version} (missing ${SUFFIX})`)
  }
  const base = version.slice(0, idx)
  const patch = Number.parseInt(version.slice(idx + SUFFIX.length), 10)
  if (isNaN(patch)) {
    throw new Error(`Invalid patch number in version: ${version}`)
  }
  return { base, patch }
}

export function formatPatchedVersion(v: PatchedVersion): string {
  return `${v.base}${SUFFIX}${v.patch}`
}

export function resetToNewBase(base: string): PatchedVersion {
  return { base, patch: 1 }
}

export function bumpPatch(v: PatchedVersion): PatchedVersion {
  return { base: v.base, patch: v.patch + 1 }
}

/** Returns true if version `a` is strictly newer than version `b`. */
export function isNewer(a: string, b: string): boolean {
  const va = parsePatchedVersion(a)
  const vb = parsePatchedVersion(b)
  const pa = va.base.split(".").map(Number) as [number, number, number]
  const pb = vb.base.split(".").map(Number) as [number, number, number]
  for (let i = 0; i < 3; i++) {
    if (pa[i]! > pb[i]!) return true
    if (pa[i]! < pb[i]!) return false
  }
  return va.patch > vb.patch
}
