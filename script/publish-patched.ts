#!/usr/bin/env bun

/**
 * Publish patched @ex-machina packages:
 * - @ex-machina/opencode-sdk
 * - @ex-machina/opencode-plugin
 * - @ex-machina/opencode (CLI)
 * - @ex-machina/opencode-darwin-arm64 (CLI binary)
 *
 * Reads version from PATCHED_VERSION file in repo root.
 * Usage: bun script/publish-patched.ts
 *
 * TODO: Add more CLI platform packages when expanding platform support:
 * - @ex-machina/opencode-darwin-x64
 * - @ex-machina/opencode-linux-arm64
 * - @ex-machina/opencode-linux-x64
 * - @ex-machina/opencode-windows-x64
 * - (and baseline/musl variants)
 */

import path from 'path'
import { $ } from 'bun'

const ROOT = new URL('..', import.meta.url).pathname

// Read version from PATCHED_VERSION file
const versionFile = path.join(ROOT, 'PATCHED_VERSION')
const FULL_VERSION = (await Bun.file(versionFile).text()).trim()

if (!FULL_VERSION) {
  console.error('Error: PATCHED_VERSION file is empty')
  process.exit(1)
}

console.log(`\n📦 Publishing patched packages version: ${FULL_VERSION}\n`)

// Check if versions already exist on npm
async function versionExists(pkg: string, version: string): Promise<boolean> {
  try {
    const result = await $`npm view ${pkg}@${version} version`.quiet()
    return result.stdout.toString().trim() === version
  } catch {
    return false
  }
}

const sdkExists = await versionExists('@ex-machina/opencode-sdk', FULL_VERSION)
const pluginExists = await versionExists('@ex-machina/opencode-plugin', FULL_VERSION)
const cliExists = await versionExists('@ex-machina/opencode', FULL_VERSION)
const cliBinaryExists = await versionExists('@ex-machina/opencode-darwin-arm64', FULL_VERSION)

if (sdkExists && pluginExists && cliExists && cliBinaryExists) {
  console.log(`⏭️  Version ${FULL_VERSION} already published for all packages. Skipping.`)
  process.exit(0)
}

// ============ SDK ============
if (sdkExists) {
  console.log(`⏭️  @ex-machina/opencode-sdk@${FULL_VERSION} already exists. Skipping.\n`)
} else {
  console.log('=== Building and publishing @ex-machina/opencode-sdk ===\n')

  const sdkDir = path.join(ROOT, 'packages/sdk/js')
  process.chdir(sdkDir)

  // Build SDK
  await $`bun tsc`

  // Read and modify package.json
  const sdkPkg = await import(path.join(sdkDir, 'package.json')).then((m) => m.default)
  const sdkOriginal = JSON.parse(JSON.stringify(sdkPkg))

  // Change name and version
  sdkPkg.name = '@ex-machina/opencode-sdk'
  sdkPkg.version = FULL_VERSION

  // Add repository for provenance verification
  sdkPkg.repository = {
    type: 'git',
    url: 'https://github.com/ex-machina-co/opencode',
  }

  // Update exports to point to dist
  for (const [key, value] of Object.entries(sdkPkg.exports as Record<string, string>)) {
    const file = value.replace('./src/', './dist/').replace('.ts', '')
    ;(sdkPkg.exports as Record<string, { import: string; types: string }>)[key] = {
      import: file + '.js',
      types: file + '.d.ts',
    }
  }

  // Remove workspace dependencies and devDependencies for publishing
  delete sdkPkg.devDependencies

  // Write modified package.json
  await Bun.write('package.json', JSON.stringify(sdkPkg, null, 2))

  // Pack and publish
  await $`bun pm pack`
  await $`npm publish *.tgz --tag latest --access public`

  // Restore original package.json
  await Bun.write('package.json', JSON.stringify(sdkOriginal, null, 2))

  // Cleanup tgz
  await $`rm -f *.tgz`

  console.log('\n✅ @ex-machina/opencode-sdk published\n')
}

// ============ Plugin ============
if (pluginExists) {
  console.log(`⏭️  @ex-machina/opencode-plugin@${FULL_VERSION} already exists. Skipping.\n`)
} else {
  console.log('=== Building and publishing @ex-machina/opencode-plugin ===\n')

  const pluginDir = path.join(ROOT, 'packages/plugin')
  process.chdir(pluginDir)

  // Build plugin
  await $`bun tsc`

  // Read and modify package.json
  const pluginPkg = await import(path.join(pluginDir, 'package.json')).then((m) => m.default)
  const pluginOriginal = JSON.parse(JSON.stringify(pluginPkg))

  // Change name and version
  pluginPkg.name = '@ex-machina/opencode-plugin'
  pluginPkg.version = FULL_VERSION

  // Add repository for provenance verification
  pluginPkg.repository = {
    type: 'git',
    url: 'https://github.com/ex-machina-co/opencode',
  }

  // Update exports to point to dist
  for (const [key, value] of Object.entries(pluginPkg.exports as Record<string, string>)) {
    const file = value.replace('./src/', './dist/').replace('.ts', '')
    ;(pluginPkg.exports as Record<string, { import: string; types: string }>)[key] = {
      import: file + '.js',
      types: file + '.d.ts',
    }
  }

  // Update dependencies - point to our patched SDK and use specific zod version
  pluginPkg.dependencies = {
    '@ex-machina/opencode-sdk': FULL_VERSION,
    zod: '4.1.8',
  }

  // Remove devDependencies for publishing
  delete pluginPkg.devDependencies

  // Write modified package.json
  await Bun.write('package.json', JSON.stringify(pluginPkg, null, 2))

  // Pack and publish
  await $`bun pm pack`
  await $`npm publish *.tgz --tag latest --access public`

  // Restore original package.json
  await Bun.write('package.json', JSON.stringify(pluginOriginal, null, 2))

  // Cleanup tgz
  await $`rm -f *.tgz`

  console.log('\n✅ @ex-machina/opencode-plugin published\n')
}

// ============ CLI ============
if (cliExists && cliBinaryExists) {
  console.log(`⏭️  @ex-machina/opencode@${FULL_VERSION} already exists. Skipping CLI.\n`)
} else {
  console.log('=== Building and publishing @ex-machina/opencode CLI ===\n')

  // Build CLI packages
  process.chdir(ROOT)
  await $`bun script/build-patched-cli.ts`

  const distCliDir = path.join(ROOT, 'dist-cli')

  // Publish platform binary package first
  if (cliBinaryExists) {
    console.log(`⏭️  @ex-machina/opencode-darwin-arm64@${FULL_VERSION} already exists. Skipping.\n`)
  } else {
    const binaryDir = path.join(distCliDir, 'opencode-darwin-arm64')
    process.chdir(binaryDir)
    await $`npm publish --tag latest --access public`
    console.log('\n✅ @ex-machina/opencode-darwin-arm64 published\n')
  }

  // Publish main CLI package
  if (cliExists) {
    console.log(`⏭️  @ex-machina/opencode@${FULL_VERSION} already exists. Skipping.\n`)
  } else {
    const mainDir = path.join(distCliDir, 'opencode')
    process.chdir(mainDir)
    await $`npm publish --tag latest --access public`
    console.log('\n✅ @ex-machina/opencode published\n')
  }
}

console.log(`\n🎉 Done! Published version ${FULL_VERSION}`)
console.log(`\nTo use the patched CLI:`)
console.log(`  npm install -g @ex-machina/opencode`)
console.log(`\nTo use in opencode-orca, update package.json:`)
console.log(`  "@opencode-ai/plugin": "npm:@ex-machina/opencode-plugin@${FULL_VERSION}",`)
console.log(`  "@opencode-ai/sdk": "npm:@ex-machina/opencode-sdk@${FULL_VERSION}",`)
