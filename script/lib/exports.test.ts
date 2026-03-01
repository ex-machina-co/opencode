import { describe, expect, test } from "bun:test"
import { transformExports } from "./exports"

describe("transformExports", () => {
  test("transforms a simple string entry", () => {
    const exports: Record<string, unknown> = {
      ".": "./src/index.ts",
    }
    transformExports(exports)
    expect(exports["."]).toEqual({
      import: "./dist/index.js",
      types: "./dist/index.d.ts",
    })
  })

  test("transforms nested object entries", () => {
    const exports: Record<string, unknown> = {
      ".": {
        import: "./src/index.ts",
      },
    }
    transformExports(exports)
    expect(exports["."]).toEqual({
      import: {
        import: "./dist/index.js",
        types: "./dist/index.d.ts",
      },
    })
  })

  test("handles deeply nested exports", () => {
    const exports: Record<string, unknown> = {
      ".": {
        node: {
          import: "./src/server.ts",
        },
        default: "./src/client.ts",
      },
    }
    transformExports(exports)
    expect(exports["."]).toEqual({
      node: {
        import: {
          import: "./dist/server.js",
          types: "./dist/server.d.ts",
        },
      },
      default: {
        import: "./dist/client.js",
        types: "./dist/client.d.ts",
      },
    })
  })

  test("leaves non-ts paths with original extension", () => {
    const exports: Record<string, unknown> = {
      ".": "./dist/already-built.js",
    }
    transformExports(exports)
    // No .ts suffix to strip, so .js is preserved and .js/.d.ts are appended
    expect(exports["."]).toEqual({
      import: "./dist/already-built.js.js",
      types: "./dist/already-built.js.d.ts",
    })
  })

  test("handles multiple top-level entries", () => {
    const exports: Record<string, unknown> = {
      ".": "./src/index.ts",
      "./server": "./src/server.ts",
      "./client": "./src/client.ts",
    }
    transformExports(exports)
    expect(exports["."]).toEqual({
      import: "./dist/index.js",
      types: "./dist/index.d.ts",
    })
    expect(exports["./server"]).toEqual({
      import: "./dist/server.js",
      types: "./dist/server.d.ts",
    })
    expect(exports["./client"]).toEqual({
      import: "./dist/client.js",
      types: "./dist/client.d.ts",
    })
  })

  test("preserves numeric and boolean values", () => {
    const exports: Record<string, unknown> = {
      ".": "./src/index.ts",
      count: 42,
      enabled: true,
    }
    transformExports(exports)
    // String gets transformed
    expect(exports["."]).toEqual({
      import: "./dist/index.js",
      types: "./dist/index.d.ts",
    })
    // Non-string, non-object values are untouched
    expect(exports.count).toBe(42)
    expect(exports.enabled).toBe(true)
  })
})
