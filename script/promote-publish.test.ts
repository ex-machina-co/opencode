import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { io } from "./lib/io"
import { FAKE_PACKAGES, FAKE_VERSION, shellResult, setup } from "./lib/test-helper"

describe("promote-publish", () => {
  let distTagSpy: ReturnType<typeof spyOn>
  let viewDistTagSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    setup()
    distTagSpy = spyOn(io, "distTagAdd").mockImplementation((() => Promise.resolve(shellResult())) as any)
    // Default: current latest is older than FAKE_VERSION so promotion proceeds
    viewDistTagSpy = spyOn(io, "viewDistTag").mockImplementation((() =>
      Promise.resolve(shellResult("1.2.14-exmachina.1"))) as any)
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

    expect(distTagSpy).toHaveBeenCalledTimes(FAKE_PACKAGES.length)
    for (const pkg of FAKE_PACKAGES) {
      expect(distTagSpy).toHaveBeenCalledWith(pkg, FAKE_VERSION, "latest")
    }
  })

  test("returns 1 when some flips fail", async () => {
    distTagSpy = spyOn(io, "distTagAdd").mockImplementation(((pkg: string) => {
      if (pkg === "@ex-machina/opencode-darwin-arm64") return Promise.reject(new Error("timeout"))
      if (pkg === "@ex-machina/opencode-linux-x64") return Promise.reject(new Error("timeout"))
      return Promise.resolve(shellResult())
    }) as any)

    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(1)
  })

  test("returns 1 when all flips fail", async () => {
    distTagSpy = spyOn(io, "distTagAdd").mockImplementation((() => Promise.reject(new Error("npm down"))) as any)

    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(1)
  })

  test("skips promotion when version equals current latest", async () => {
    viewDistTagSpy = spyOn(io, "viewDistTag").mockImplementation((() =>
      Promise.resolve(shellResult(FAKE_VERSION))) as any)

    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(0)
    expect(distTagSpy).not.toHaveBeenCalled()
  })

  test("skips promotion when version is older than current latest", async () => {
    viewDistTagSpy = spyOn(io, "viewDistTag").mockImplementation((() =>
      Promise.resolve(shellResult("1.2.15-exmachina.5"))) as any)

    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(0)
    expect(distTagSpy).not.toHaveBeenCalled()
  })

  test("skips promotion when current latest has higher base version", async () => {
    viewDistTagSpy = spyOn(io, "viewDistTag").mockImplementation((() =>
      Promise.resolve(shellResult("1.3.0-exmachina.1"))) as any)

    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(0)
    expect(distTagSpy).not.toHaveBeenCalled()
  })

  test("promotes when no current latest exists", async () => {
    viewDistTagSpy = spyOn(io, "viewDistTag").mockImplementation((() => Promise.reject(new Error("not found"))) as any)

    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(0)
    expect(distTagSpy).toHaveBeenCalledTimes(FAKE_PACKAGES.length)
  })

  test("promotes when current latest is not in exmachina format", async () => {
    viewDistTagSpy = spyOn(io, "viewDistTag").mockImplementation((() => Promise.resolve(shellResult("1.2.15"))) as any)

    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(0)
    expect(distTagSpy).toHaveBeenCalledTimes(FAKE_PACKAGES.length)
  })

  test("promotes only packages behind while skipping up-to-date ones", async () => {
    viewDistTagSpy = spyOn(io, "viewDistTag").mockImplementation(((pkg: string) => {
      // Most packages already at current version, one is behind
      if (pkg === "@ex-machina/opencode-linux-arm64") return Promise.resolve(shellResult("1.2.14-exmachina.1"))
      return Promise.resolve(shellResult(FAKE_VERSION))
    }) as any)

    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(0)
    expect(distTagSpy).toHaveBeenCalledTimes(1)
    expect(distTagSpy).toHaveBeenCalledWith("@ex-machina/opencode-linux-arm64", FAKE_VERSION, "latest")
  })

  test("promotes package with placeholder version", async () => {
    viewDistTagSpy = spyOn(io, "viewDistTag").mockImplementation(((pkg: string) => {
      if (pkg === "@ex-machina/opencode-linux-arm64") return Promise.resolve(shellResult("0.0.0-exmachina.0"))
      return Promise.resolve(shellResult(FAKE_VERSION))
    }) as any)

    const { main } = await import("./promote-publish")
    const code = await main()
    expect(code).toBe(0)
    expect(distTagSpy).toHaveBeenCalledTimes(1)
    expect(distTagSpy).toHaveBeenCalledWith("@ex-machina/opencode-linux-arm64", FAKE_VERSION, "latest")
  })
})
