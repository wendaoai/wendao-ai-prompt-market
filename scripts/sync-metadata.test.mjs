import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

test('fills preview dimensions without operating system image commands', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cw-market-metadata-'))
  try {
    await mkdir(path.join(root, 'scripts'))
    await mkdir(path.join(root, 'data', 'catalogs'), { recursive: true })
    await mkdir(path.join(root, 'assets', 'models'), { recursive: true })
    for (const name of ['sync-metadata.mjs', 'image-size.mjs']) {
      await copyFile(path.join(import.meta.dirname, name), path.join(root, 'scripts', name))
    }
    const catalogs = ['prompts', 'prompt-styles', 'fonts', 'papers', 'overlays', 'decorations', 'models', 'scenes', 'cover-templates', 'inner-templates']
    for (const name of catalogs) {
      await writeFile(path.join(root, 'data', 'catalogs', `${name}.json`), JSON.stringify({
        resources: name === 'models' ? [{ type: 'model', assetPath: 'assets/models/model.cwmodel.zip', previewPath: 'assets/models/model.png', details: {} }] : [],
      }))
    }
    await writeFile(path.join(root, 'assets', 'models', 'model.cwmodel.zip'), 'test-package')
    await writeFile(path.join(root, 'assets', 'models', 'model.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDUcAAAAASUVORK5CYII=', 'base64'))
    await promisify(execFile)(process.execPath, [path.join(root, 'scripts', 'sync-metadata.mjs')], { env: { ...process.env, PATH: '' } })
    const document = JSON.parse(await readFile(path.join(root, 'data', 'catalogs', 'models.json'), 'utf8'))
    const item = document.resources[0]
    assert.deepEqual(item.details, { previewWidth: 1, previewHeight: 1 })
    assert.equal(item.byteSize, 12)
    assert.equal(item.sha256.length, 64)
    assert.equal(item.previewMimeType, 'image/png')
    assert.equal(item.previewSha256.length, 64)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
