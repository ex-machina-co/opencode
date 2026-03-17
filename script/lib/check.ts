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
  console.log("   Running typecheck...")
  await $`bun run turbo typecheck`.cwd(root)
  if (opts?.skipTests) {
    console.log("   Skipping tests (--skip-tests)")
    return
  }
  console.log("   Running tests...")
  try {
    await $`bun run turbo test`.cwd(root)
  } catch {
    const answer = await prompt("\n   Tests failed. Continue anyway? [y/N] ")
    if (answer !== "y" && answer !== "yes") throw new Error("Tests failed")
  }
}
