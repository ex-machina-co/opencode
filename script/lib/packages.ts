/**
 * Discover all @ex-machina/* packages from build output + static names.
 *
 * Scans packages/opencode/dist/ for binary package names and adds
 * the static SDK, plugin, and wrapper packages.
 *
 * Requires the build to have run first (dist/ must exist).
 */

import path from "path"

const SCOPE = "@ex-machina"
const ROOT = path.resolve(import.meta.dir, "..", "..")
const DIST_DIR = path.join(ROOT, "packages/opencode/dist")

export const PATCHED_VERSION = (await Bun.file(path.join(ROOT, "PATCHED_VERSION")).text()).trim()

/** Scan dist/ for binary package names, add static packages. Wrapper is always last. */
export async function allPackages() {
  const binaries: string[] = []

  for await (const filepath of new Bun.Glob("*/package.json").scan({ cwd: DIST_DIR })) {
    const pkg = await Bun.file(path.join(DIST_DIR, filepath)).json()
    binaries.push(pkg.name as string)
  }

  if (binaries.length === 0) {
    throw new Error(`No binary packages found in ${DIST_DIR}. Did you run the build first?`)
  }

  // Separate wrapper from platform binaries
  const wrapper = `${SCOPE}/opencode`
  const platforms = binaries.filter((b) => b !== wrapper)

  return [
    `${SCOPE}/opencode-sdk`,
    `${SCOPE}/opencode-plugin`,
    ...platforms,
    wrapper, // always last
  ]
}
