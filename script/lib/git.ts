/**
 * Git operation helpers for sync script
 */

import { $ } from "bun"

export async function getCurrentBranch(): Promise<string> {
  const result = await $`git branch --show-current`.quiet()
  return result.stdout.toString().trim()
}

export async function checkout(branch: string): Promise<void> {
  await $`git checkout ${branch}`.quiet()
}

export async function fetch(remote: string): Promise<void> {
  await $`git fetch ${remote}`
}

export async function resetHardTo(ref: string): Promise<void> {
  await $`git reset --hard ${ref}`.quiet()
}

export async function push(
  remote: string,
  branch: string,
  options?: Partial<Record<"tags" | "noVerify", boolean>>,
): Promise<void> {
  await $`git push ${remote} ${branch} ${options?.tags ? "--tags" : ""} ${options?.noVerify ? "--no-verify" : ""}`
}

export async function merge(branch: string): Promise<void> {
  // Regular merge - will throw on conflicts
  await $`git merge ${branch} --no-edit`
}

export async function hasUncommittedChanges(): Promise<boolean> {
  const result = await $`git status --porcelain`.quiet()
  return result.stdout.toString().trim().length > 0
}

export async function commitAll(message: string): Promise<void> {
  await $`git add -A`.quiet()
  await $`git commit -m ${message}`.quiet()
}

export async function getFileContent(path: string): Promise<string> {
  const file = Bun.file(path)
  return await file.text()
}

export async function writeFile(path: string, content: string): Promise<void> {
  await Bun.write(path, content)
}
