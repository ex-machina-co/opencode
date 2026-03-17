import { $ } from "bun"
import path from "path"

export async function check(root: string) {
  const cwd = path.join(root, "packages/opencode")
  console.log("   Running typecheck...")
  await $`bun run typecheck`.cwd(cwd)
  console.log("   Running tests...")
  await $`bun test --timeout 30000`.cwd(cwd)
}
