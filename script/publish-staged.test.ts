import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { io } from "./lib/io"
import { FAKE_VERSION, shellResult, setup } from "./lib/test-helper"

// Fake package.json content for SDK and Plugin
const FAKE_SDK_PKG = JSON.stringify({
  name: "opencode-sdk",
  version: "0.0.0",
  exports: { ".": "./src/index.ts" },
  devDependencies: { typescript: "^5.0.0" },
})

const FAKE_PLUGIN_PKG = JSON.stringify({
  name: "opencode-plugin",
  version: "0.0.0",
  exports: { ".": "./src/index.ts" },
  dependencies: { zod: "^3.0.0" },
  devDependencies: { typescript: "^5.0.0" },
})

describe("publish-staged", () => {
  let viewVersionSpy: ReturnType<typeof spyOn>
  let publishSpy: ReturnType<typeof spyOn>
  let packSpy: ReturnType<typeof spyOn>
  let writeFileSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    setup()

    // Default: no versions exist (everything needs publishing)
    viewVersionSpy = spyOn(io, "viewVersion").mockImplementation((() => Promise.reject(new Error("404"))) as any)

    // Track file writes
    spyOn(io, "readFile").mockImplementation(((path: string) => {
      if (path.includes("sdk/js/package.json")) return Promise.resolve(FAKE_SDK_PKG)
      if (path.includes("plugin/package.json")) return Promise.resolve(FAKE_PLUGIN_PKG)
      return Promise.resolve("{}")
    }) as any)
    writeFileSpy = spyOn(io, "writeFile").mockImplementation((() => Promise.resolve(0)) as any)

    // Mock shell commands
    packSpy = spyOn(io, "pack").mockImplementation((() => Promise.resolve(shellResult())) as any)
    publishSpy = spyOn(io, "publish").mockImplementation((() => Promise.resolve(shellResult())) as any)
    spyOn(io, "chmod").mockImplementation((() => Promise.resolve(shellResult())) as any)
    spyOn(io, "rm").mockImplementation((() => Promise.resolve(shellResult())) as any)
  })

  afterEach(() => {
    mock.restore()
  })

  test("returns 0 when all packages publish successfully", async () => {
    const { main } = await import("./publish-staged")
    const code = await main()
    expect(code).toBe(0)
  })

  test("publishes all packages when none exist yet", async () => {
    const { main } = await import("./publish-staged")
    await main()

    // SDK + plugin + 3 binaries + wrapper = 6 publishes
    expect(publishSpy).toHaveBeenCalledTimes(6)
  })

  test("skips already-published packages", async () => {
    // SDK and one binary already exist
    viewVersionSpy.mockImplementation(((pkg: string, ver: string) => {
      if (pkg === "@ex-machina/opencode-sdk") return Promise.resolve(shellResult(ver))
      if (pkg === "@ex-machina/opencode-linux-arm64") return Promise.resolve(shellResult(ver))
      return Promise.reject(new Error("404"))
    }) as any)

    const { main } = await import("./publish-staged")
    await main()

    // 6 total - 2 skipped = 4 publishes
    expect(publishSpy).toHaveBeenCalledTimes(4)
  })

  test("skips everything on idempotent re-run", async () => {
    // All versions already exist
    viewVersionSpy.mockImplementation(((_pkg: string, ver: string) => Promise.resolve(shellResult(ver))) as any)

    const { main } = await import("./publish-staged")
    const code = await main()

    expect(code).toBe(0)
    expect(publishSpy).not.toHaveBeenCalled()
  })

  test("restores SDK package.json after publish", async () => {
    const { main } = await import("./publish-staged")
    await main()

    const sdkWrites = writeFileSpy.mock.calls.filter((args: unknown[]) =>
      (args[0] as string).includes("sdk/js/package.json"),
    )
    expect(sdkWrites.length).toBeGreaterThanOrEqual(2) // modified + restored
    expect(sdkWrites.at(-1)?.[1]).toBe(FAKE_SDK_PKG) // restored to original
  })

  test("restores SDK package.json even when publish fails", async () => {
    publishSpy.mockImplementation(((cwd: string) => {
      if (cwd.includes("sdk/js")) return Promise.reject(new Error("token expired"))
      return Promise.resolve(shellResult())
    }) as any)

    const { main } = await import("./publish-staged")
    await main().catch(() => 1)

    // SDK package.json should still be restored
    const sdkWrites = writeFileSpy.mock.calls.filter((args: unknown[]) =>
      (args[0] as string).includes("sdk/js/package.json"),
    )
    expect(sdkWrites.at(-1)?.[1]).toBe(FAKE_SDK_PKG)
  })

  test("modifies SDK package.json correctly before publish", async () => {
    const { main } = await import("./publish-staged")
    await main()

    // First write to SDK should be the modified version
    const sdkWrites = writeFileSpy.mock.calls.filter((args: unknown[]) =>
      (args[0] as string).includes("sdk/js/package.json"),
    )
    const modified = JSON.parse(sdkWrites[0]?.[1] as string)

    expect(modified.name).toBe("@ex-machina/opencode-sdk")
    expect(modified.version).toBe(FAKE_VERSION)
    expect(modified.repository.url).toBe("https://github.com/ex-machina-co/opencode")
    expect(modified.devDependencies).toBeUndefined()
    // exports should be transformed
    expect(modified.exports["."]).toEqual({
      import: "./dist/index.js",
      types: "./dist/index.d.ts",
    })
  })

  test("modifies Plugin package.json correctly before publish", async () => {
    const { main } = await import("./publish-staged")
    await main()

    const pluginWrites = writeFileSpy.mock.calls.filter((args: unknown[]) =>
      (args[0] as string).includes("plugin/package.json"),
    )
    const modified = JSON.parse(pluginWrites[0]?.[1] as string)

    expect(modified.name).toBe("@ex-machina/opencode-plugin")
    expect(modified.version).toBe(FAKE_VERSION)
    expect(modified.dependencies["@ex-machina/opencode-sdk"]).toBe(FAKE_VERSION)
    expect(modified.dependencies.zod).toBe("^3.0.0")
    expect(modified.devDependencies).toBeUndefined()
  })

  test("returns 1 when binary publish fails", async () => {
    publishSpy.mockImplementation(((cwd: string) => {
      if (cwd.includes("opencode-darwin-arm64")) return Promise.reject(new Error("token expired"))
      return Promise.resolve(shellResult())
    }) as any)

    const { main } = await import("./publish-staged")
    const code = await main().catch(() => 1)
    expect(code).toBe(1)
  })

  test("publishes binaries with staging tag", async () => {
    const { main } = await import("./publish-staged")
    await main()

    // Every publish call should use "staging" tag
    for (const call of publishSpy.mock.calls) {
      expect(call[1]).toBe("staging")
    }
  })
})
