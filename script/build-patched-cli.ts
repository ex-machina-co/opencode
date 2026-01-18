#!/usr/bin/env bun

/**
 * Build patched opencode CLI binary
 *
 * Currently builds only darwin-arm64. To add more platforms, add entries to the
 * `targets` array following the pattern in packages/opencode/script/build.ts
 *
 * TODO: Add support for all platforms:
 * - linux-arm64, linux-x64, linux-x64-baseline
 * - linux-arm64-musl, linux-x64-musl, linux-x64-musl-baseline
 * - darwin-x64, darwin-x64-baseline
 * - windows-x64, windows-x64-baseline
 */

import fs from 'fs'
import path from 'path'
import { $ } from 'bun'

const ROOT = path.resolve(import.meta.dir, '..')
const OPENCODE_DIR = path.join(ROOT, 'packages/opencode')
const PATCHED_VERSION_FILE = path.join(ROOT, 'PATCHED_VERSION')

// Read patched version
const PATCHED_VERSION = (await Bun.file(PATCHED_VERSION_FILE).text()).trim()
if (!PATCHED_VERSION) {
  console.error('Error: PATCHED_VERSION file is empty')
  process.exit(1)
}

console.log(`\nBuilding patched CLI version: ${PATCHED_VERSION}\n`)

// Change to opencode package directory for build
process.chdir(OPENCODE_DIR)

// Import solid plugin from the opencode package's node_modules
const solidPlugin = (
  await import(path.join(OPENCODE_DIR, 'node_modules/@opentui/solid/scripts/solid-plugin'))
).default
const pkg = (await Bun.file(path.join(OPENCODE_DIR, 'package.json')).json()) as {
  dependencies: Record<string, string>
}

// TODO: Expand this array to support all platforms
// See packages/opencode/script/build.ts for the full list
const targets: { os: string; arch: 'arm64' | 'x64'; abi?: 'musl'; avx2?: false }[] = [
  { os: 'darwin', arch: 'arm64' },
]

const distDir = path.join(ROOT, 'dist-cli')
await $`rm -rf ${distDir}`

// Install platform-specific dependencies
await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies['@opentui/core']}`
await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies['@parcel/watcher']}`

const binaries: Record<string, string> = {}

for (const item of targets) {
  const platformName = item.os === 'win32' ? 'windows' : item.os
  const nameParts = ['opencode', platformName, item.arch]
  if (item.avx2 === false) nameParts.push('baseline')
  if (item.abi) nameParts.push(item.abi)

  const baseName = nameParts.join('-')
  const pkgName = `@ex-machina/${baseName}`

  console.log(`Building ${pkgName}...`)

  const outDir = path.join(distDir, baseName)
  await $`mkdir -p ${outDir}/bin`

  const parserWorker = fs.realpathSync(
    path.join(OPENCODE_DIR, 'node_modules/@opentui/core/parser.worker.js'),
  )
  const workerPath = './src/cli/cmd/tui/worker.ts'

  const bunfsRoot = item.os === 'win32' ? 'B:/~BUN/root/' : '/$bunfs/root/'
  const workerRelativePath = path.relative(OPENCODE_DIR, parserWorker).replaceAll('\\', '/')

  const bunTarget = `bun-${platformName}-${item.arch}${item.avx2 === false ? '-baseline' : ''}`

  await Bun.build({
    conditions: ['browser'],
    tsconfig: './tsconfig.json',
    plugins: [solidPlugin],
    sourcemap: 'external',
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      // @ts-ignore (bun types aren't up to date)
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: bunTarget as any,
      outfile: path.join(outDir, 'bin/opencode'),
      execArgv: [`--user-agent=opencode/${PATCHED_VERSION}`, '--use-system-ca', '--'],
      windows: {},
    },
    entrypoints: ['./src/index.ts', parserWorker, workerPath],
    define: {
      OPENCODE_VERSION: `'${PATCHED_VERSION}'`,
      OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + workerRelativePath,
      OPENCODE_WORKER_PATH: workerPath,
      OPENCODE_CHANNEL: `'latest'`,
      OPENCODE_LIBC: item.os === 'linux' ? `'${item.abi ?? 'glibc'}'` : `''`,
    },
  })

  // Clean up tui directory if created
  await $`rm -rf ${outDir}/bin/tui`.quiet().nothrow()

  // Write platform package.json
  await Bun.write(
    path.join(outDir, 'package.json'),
    JSON.stringify(
      {
        name: pkgName,
        version: PATCHED_VERSION,
        os: [item.os],
        cpu: [item.arch],
        repository: {
          type: 'git',
          url: 'https://github.com/ex-machina-co/opencode',
        },
      },
      null,
      2,
    ),
  )

  binaries[baseName] = PATCHED_VERSION
  console.log(`  Built ${pkgName}`)
}

// Create main package
console.log(`\nCreating main @ex-machina/opencode package...`)
const mainPkgDir = path.join(distDir, 'opencode')
await $`mkdir -p ${mainPkgDir}/bin`

// Copy bin wrapper script, modified for @ex-machina scope
const binWrapper = `#!/usr/bin/env node

const childProcess = require("child_process")
const fs = require("fs")
const path = require("path")
const os = require("os")

function run(target) {
  const result = childProcess.spawnSync(target, process.argv.slice(2), {
    stdio: "inherit",
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  const code = typeof result.status === "number" ? result.status : 0
  process.exit(code)
}

const envPath = process.env.OPENCODE_BIN_PATH
if (envPath) {
  run(envPath)
}

const scriptPath = fs.realpathSync(__filename)
const scriptDir = path.dirname(scriptPath)

const platformMap = { darwin: "darwin", linux: "linux", win32: "windows" }
const archMap = { x64: "x64", arm64: "arm64", arm: "arm" }

let platform = platformMap[os.platform()] || os.platform()
let arch = archMap[os.arch()] || os.arch()
const base = "@ex-machina/opencode-" + platform + "-" + arch
const binary = platform === "windows" ? "opencode.exe" : "opencode"

function findBinary(startDir) {
  let current = startDir
  for (;;) {
    const modules = path.join(current, "node_modules")
    if (fs.existsSync(modules)) {
      const scoped = path.join(modules, "@ex-machina")
      if (fs.existsSync(scoped)) {
        const entries = fs.readdirSync(scoped)
        for (const entry of entries) {
          if (!entry.startsWith("opencode-" + platform + "-" + arch)) continue
          const candidate = path.join(scoped, entry, "bin", binary)
          if (fs.existsSync(candidate)) return candidate
        }
      }
    }
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}

const resolved = findBinary(scriptDir)
if (!resolved) {
  console.error(
    'It seems that your package manager failed to install the right version of the opencode CLI for your platform. You can try manually installing the "' +
      base + '" package'
  )
  process.exit(1)
}

run(resolved)
`

await Bun.write(path.join(mainPkgDir, 'bin/opencode'), binWrapper)
await $`chmod +x ${mainPkgDir}/bin/opencode`

// Build optionalDependencies from built binaries
// TODO: Add all platform packages here when expanding platform support
const optionalDeps: Record<string, string> = {}
for (const [baseName, version] of Object.entries(binaries)) {
  optionalDeps[`@ex-machina/${baseName}`] = version
}

await Bun.write(
  path.join(mainPkgDir, 'package.json'),
  JSON.stringify(
    {
      name: '@ex-machina/opencode',
      version: PATCHED_VERSION,
      description: 'Patched opencode CLI with additional features',
      bin: { opencode: 'bin/opencode' },
      optionalDependencies: optionalDeps,
      repository: {
        type: 'git',
        url: 'https://github.com/ex-machina-co/opencode',
      },
    },
    null,
    2,
  ),
)

console.log(`  Created @ex-machina/opencode\n`)
console.log(`Build complete! Output in ${distDir}`)
console.log(`\nPackages built:`)
console.log(`  - @ex-machina/opencode@${PATCHED_VERSION}`)
for (const [baseName, version] of Object.entries(binaries)) {
  console.log(`  - @ex-machina/${baseName}@${version}`)
}

export { binaries, PATCHED_VERSION }
