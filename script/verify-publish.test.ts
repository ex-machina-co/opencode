import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { io } from "./lib/io"

const FAKE_VERSION = "1.2.15-exmachina.1"
const FAKE_PACKAGES = [
  "@ex-machina/opencode-sdk",
  "@ex-machina/opencode-plugin",
  "@ex-machina/opencode-linux-arm64",
  "@ex-machina/opencode-linux-x64",
  "@ex-machina/opencode-darwin-arm64",
  "@ex-machina/opencode",
]

// Mock packages module to avoid needing a real dist/
mock.module("./lib/packages", () => ({
  PATCHED_VERSION: FAKE_VERSION,
  allPackages: async () => FAKE_PACKAGES,
}))

function shellResult(stdout: string) {
  return { stdout: Buffer.from(stdout), exitCode: 0 } as any
}

describe("verify-publish", () => {
  beforeEach(() => {
    // Default: all packages exist
    spyOn(io, "viewVersion").mockImplementation(((_pkg: string, ver: string) =>
      Promise.resolve(shellResult(ver))) as any)
  })

  afterEach(() => {
    mock.restore()
  })

  test("returns 0 when all packages exist", async () => {
    const { main } = await import("./verify-publish")
    const code = await main()
    expect(code).toBe(0)
  })

  test("returns 1 when some packages are missing", async () => {
    spyOn(io, "viewVersion").mockImplementation(((pkg: string, ver: string) => {
      if (pkg === "@ex-machina/opencode-darwin-arm64") return Promise.reject(new Error("404"))
      if (pkg === "@ex-machina/opencode-linux-arm64") return Promise.reject(new Error("404"))
      return Promise.resolve(shellResult(ver))
    }) as any)

    const { main } = await import("./verify-publish")
    const code = await main()
    expect(code).toBe(1)
  })

  test("returns 1 when all packages are missing (npm down)", async () => {
    spyOn(io, "viewVersion").mockImplementation((() => Promise.reject(new Error("network error"))) as any)

    const { main } = await import("./verify-publish")
    const code = await main()
    expect(code).toBe(1)
  })

  test("returns 1 when npm returns wrong version", async () => {
    spyOn(io, "viewVersion").mockImplementation(((pkg: string) => {
      if (pkg === "@ex-machina/opencode-sdk") return Promise.resolve(shellResult("0.0.0-wrong"))
      return Promise.resolve(shellResult(FAKE_VERSION))
    }) as any)

    const { main } = await import("./verify-publish")
    const code = await main()
    expect(code).toBe(1)
  })
})
