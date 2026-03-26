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
        await Bun.write(
          path.join(pluginDir, "check-clients.ts"),
          [
            "export default async (input) => {",
            "  const v1 = await input.client.session.list()",
            "  const v2 = await input.clientNext.session.list()",
            "  return {",
            "    tool: {",
            '      "test.check-v1": {',
            '        description: "reports v1 client result",',
            "        args: {},",
            "        execute: async () => JSON.stringify({",
            "          ok: v1.response.ok,",
            "          data: v1.data,",
            "        }),",
            "      },",
            '      "test.check-v2": {',
            '        description: "reports v2 client result",',
            "        args: {},",
            "        execute: async () => JSON.stringify({",
            "          ok: v2.response.ok,",
            "          data: v2.data,",
            "        }),",
            "      },",
            "    },",
            "  }",
            "}",
          ].join("\n"),
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
