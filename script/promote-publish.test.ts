import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { io } from "./lib/io"
import { FAKE_PACKAGES, shellResult, setup } from "./lib/test-helper"

describe("promote-publish", () => {
  let spy: ReturnType<typeof spyOn>

  beforeEach(() => {
    setup()
    spy = spyOn(io, "distTagAdd").mockImplementation((() => Promise.resolve(shellResult())) as any)
  })

  afterEach(() => {
    mock.restore()
  })

  test("returns 0 when all dist-tag flips succeed", async () => {
    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(0)
  })

  test("calls distTagAdd for every package", async () => {
    const { main } = await import("./promote-publish")
    await main()

    // Filter to only calls from THIS test (spy was fresh from beforeEach)
    expect(spy).toHaveBeenCalledTimes(FAKE_PACKAGES.length)
    for (const pkg of FAKE_PACKAGES) {
      expect(spy).toHaveBeenCalledWith(pkg, "1.2.15-exmachina.1", "latest")
    }
  })

  test("returns 1 when some flips fail", async () => {
    spy = spyOn(io, "distTagAdd").mockImplementation(((pkg: string) => {
      if (pkg === "@ex-machina/opencode-darwin-arm64") return Promise.reject(new Error("timeout"))
      if (pkg === "@ex-machina/opencode-linux-x64") return Promise.reject(new Error("timeout"))
      return Promise.resolve(shellResult())
    }) as any)

    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(1)
  })

  test("returns 1 when all flips fail", async () => {
    spy = spyOn(io, "distTagAdd").mockImplementation((() => Promise.reject(new Error("npm down"))) as any)

    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(1)
  })
})
