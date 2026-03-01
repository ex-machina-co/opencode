import { mock, spyOn } from "bun:test"
import { io } from "./io"

export const FAKE_VERSION = "1.2.15-exmachina.1"
export const FAKE_PACKAGES = [
  "@ex-machina/opencode-sdk",
  "@ex-machina/opencode-plugin",
  "@ex-machina/opencode-linux-arm64",
  "@ex-machina/opencode-linux-x64",
  "@ex-machina/opencode-darwin-arm64",
  "@ex-machina/opencode",
]

export function shellResult(stdout = "") {
  return { stdout: Buffer.from(stdout), exitCode: 0 } as any
}

export function setup() {
  mock.module("./packages", () => ({
    PATCHED_VERSION: FAKE_VERSION,
    allPackages: async () => FAKE_PACKAGES,
  }))
  spyOn(io, "log").mockImplementation(() => {})
  spyOn(io, "error").mockImplementation(() => {})
  spyOn(io, "sleep").mockResolvedValue(undefined as any)
}
