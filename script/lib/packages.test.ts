import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import path from "path"
import { $ } from "bun"

const ROOT = path.resolve(import.meta.dir, "..", "..")
const DIST_DIR = path.join(ROOT, "packages/opencode/dist")

// Fake scoped package names (as build-patched-cli.ts would produce)
const FAKE_PACKAGES = [
  { dir: "opencode-linux-arm64", name: "@ex-machina/opencode-linux-arm64" },
  { dir: "opencode-linux-x64", name: "@ex-machina/opencode-linux-x64" },
  { dir: "opencode-darwin-arm64", name: "@ex-machina/opencode-darwin-arm64" },
  { dir: "@ex-machina-opencode", name: "@ex-machina/opencode" },
]

describe("packages", () => {
  let savedDist: string | null = null

  beforeAll(async () => {
    // Move existing dist/ aside if it exists
    const exists = (await $`test -d ${DIST_DIR}`.nothrow()).exitCode === 0
    if (exists) {
      savedDist = DIST_DIR + ".bak-test"
      await $`mv ${DIST_DIR} ${savedDist}`
    }

    // Create fake dist/
    for (const pkg of FAKE_PACKAGES) {
      const dir = path.join(DIST_DIR, pkg.dir)
      await $`mkdir -p ${dir}`
      await Bun.write(path.join(dir, "package.json"), JSON.stringify({ name: pkg.name, version: "1.0.0-test.0" }))
    }
  })

  afterAll(async () => {
    // Remove fake dist/ and restore original if it existed
    await $`rm -rf ${DIST_DIR}`.nothrow()
    if (savedDist) {
      await $`mv ${savedDist} ${DIST_DIR}`
    }
  })

  test("allPackages discovers packages from dist and includes static names", async () => {
    const { allPackages } = await import("./packages")
    const packages = await allPackages()

    // Should include static SDK and plugin
    expect(packages).toContain("@ex-machina/opencode-sdk")
    expect(packages).toContain("@ex-machina/opencode-plugin")

    // Should include discovered binaries
    expect(packages).toContain("@ex-machina/opencode-linux-arm64")
    expect(packages).toContain("@ex-machina/opencode-linux-x64")
    expect(packages).toContain("@ex-machina/opencode-darwin-arm64")

    // Wrapper should always be last
    expect(packages[packages.length - 1]).toBe("@ex-machina/opencode")

    // SDK and plugin should be first
    expect(packages[0]).toBe("@ex-machina/opencode-sdk")
    expect(packages[1]).toBe("@ex-machina/opencode-plugin")
  })

  test("allPackages does not duplicate wrapper", async () => {
    const { allPackages } = await import("./packages")
    const packages = await allPackages()
    const wrapperCount = packages.filter((p) => p === "@ex-machina/opencode").length
    expect(wrapperCount).toBe(1)
  })
})
