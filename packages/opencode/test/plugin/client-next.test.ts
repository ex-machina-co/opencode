import { beforeAll, describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Plugin } from "../../src/plugin"
import type { Hooks } from "@opencode-ai/plugin"
import type { ToolContext } from "../../../plugin/dist"

describe("plugin.sdk-clients", () => {
  let hooks: Hooks[]

  beforeAll(async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const pluginDir = path.join(dir, ".opencode", "plugin")
        await fs.mkdir(pluginDir, { recursive: true })
        await fs.copyFile(
          path.join(import.meta.dir, "fixtures", "check-clients.ts"),
          path.join(pluginDir, "check-clients.ts"),
        )
      },
    })

    hooks = await Instance.provide({
      directory: tmp.path,
      fn: async () => Plugin.list(),
    })
  }, 30000)

  test("v1 SDK client (client)", async () => {
    const hook = hooks.find((h) => h.tool?.["test.check-v1"])
    expect(hook).toBeDefined()

    const result = JSON.parse(await hook!.tool!["test.check-v1"].execute({}, {} as any as ToolContext))
    expect(result.ok).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
  })

  test("v2 SDK client (clientNext)", async () => {
    const hook = hooks.find((h) => h.tool?.["test.check-v2"])
    expect(hook).toBeDefined()

    const result = JSON.parse(await hook!.tool!["test.check-v2"].execute({}, {} as any as ToolContext))
    expect(result.ok).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
  })
})
