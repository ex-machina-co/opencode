import type { PluginInput } from "@opencode-ai/plugin"

export default async (input: PluginInput) => {
  const v1 = await input.client.session.list()
  const v2 = await input.clientNext.session.list()
  return {
    tool: {
      "test.check-v1": {
        description: "reports v1 client result",
        args: {},
        execute: async () =>
          JSON.stringify({
            ok: v1.response.ok,
            data: v1.data,
          }),
      },
      "test.check-v2": {
        description: "reports v2 client result",
        args: {},
        execute: async () =>
          JSON.stringify({
            ok: v2.response.ok,
            data: v2.data,
          }),
      },
    },
  }
}
