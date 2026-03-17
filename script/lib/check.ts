import { $ } from "bun"
import path from "path"
import readline from "readline"

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

export async function check(root: string, opts?: { skipTests?: boolean }) {
  const cwd = path.join(root, "packages/opencode")
  console.log("   Running typecheck...")
  await $`bun run typecheck`.cwd(cwd)
  if (opts?.skipTests) {
    console.log("   Skipping tests (--skip-tests)")
    return
  }
  console.log("   Running tests...")
  try {
    await $`bun test --timeout 30000`.cwd(cwd)
  } catch {
    const answer = await prompt("\n   Tests failed. Continue anyway? [y/N] ")
    if (answer !== "y" && answer !== "yes") throw new Error("Tests failed")
  }
}
