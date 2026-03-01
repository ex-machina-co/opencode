/**
 * Transform package.json export entries from source (.ts) to dist (.js/.d.ts).
 *
 * Recursively walks the exports object, replacing ./src/*.ts paths with
 * { import: ./dist/*.js, types: ./dist/*.d.ts } pairs.
 */
export function transformExports(exports: Record<string, unknown>) {
  for (const [key, value] of Object.entries(exports)) {
    if (typeof value === "object" && value !== null) {
      transformExports(value as Record<string, unknown>)
    } else if (typeof value === "string") {
      const file = value.replace("./src/", "./dist/").replace(/\.ts$/, "")
      exports[key] = {
        import: file + ".js",
        types: file + ".d.ts",
      }
    }
  }
}
