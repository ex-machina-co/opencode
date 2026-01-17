import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { ToolRegistry } from "../../src/tool/registry"
import { Tool } from "../../src/tool/tool"

describe("tool.registry", () => {
  test("loads tools from .opencode/tool (singular)", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const opencodeDir = path.join(dir, ".opencode")
        await fs.mkdir(opencodeDir, { recursive: true })

        const toolDir = path.join(opencodeDir, "tool")
        await fs.mkdir(toolDir, { recursive: true })

        await Bun.write(
          path.join(toolDir, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        )

        await Bun.write(
          path.join(toolDir, "goodbye.ts"),
          [
            "export default {",
            "  description: 'goodbye tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return {",
            "      title: 'goodbye title',",
            "      output: 'goodbye world',",
            "      metadata: { nihilism: true },",
            "    }",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tools = await ToolRegistry.tools('opencode')
        const hello = tools.find((t) => t.id === "hello")
        const goodbye = tools.find((t) => t.id === "goodbye")

        expect(hello).toBeDefined()
        expect(goodbye).toBeDefined()

        const helloResult = await hello?.execute({}, {} as Tool.Context)
        const goodbyeResult = await goodbye?.execute({}, {} as Tool.Context)

        expect(helloResult).toMatchInlineSnapshot(`
          {
            "metadata": {
              "outputPath": undefined,
              "truncated": false,
            },
            "output": "hello world",
            "title": "",
          }
        `)
        expect(goodbyeResult).toMatchInlineSnapshot(`
          {
            "metadata": {
              "nihilism": true,
              "outputPath": undefined,
              "truncated": false,
            },
            "output": "goodbye world",
            "title": "goodbye title",
          }
        `)
      },
    })
  })

  test("loads tools from .opencode/tools (plural)", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const opencodeDir = path.join(dir, ".opencode")
        await fs.mkdir(opencodeDir, { recursive: true })

        const toolsDir = path.join(opencodeDir, "tools")
        await fs.mkdir(toolsDir, { recursive: true })

        await Bun.write(
          path.join(toolsDir, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("hello")
      },
    })
  })
})
