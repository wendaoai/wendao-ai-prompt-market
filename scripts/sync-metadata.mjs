import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const catalogs = ['prompts', 'prompt-styles', 'fonts', 'papers', 'overlays', 'decorations', 'models', 'scenes']

function dimensions(filename) {
  return new Promise((resolve, reject) => {
    execFile('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filename], (error, stdout) => {
      if (error) return reject(error)
      const width = Number(stdout.match(/pixelWidth: (\d+)/)?.[1])
      const height = Number(stdout.match(/pixelHeight: (\d+)/)?.[1])
      if (!width || !height) return reject(new Error(`无法读取图片尺寸: ${filename}`))
      resolve({ width, height })
    })
  })
}

async function metadata(relativePath) {
  const data = await readFile(path.join(root, relativePath))
  return { byteSize: data.length, sha256: createHash('sha256').update(data).digest('hex') }
}

for (const name of catalogs) {
  const filename = path.join(root, 'data', 'catalogs', `${name}.json`)
  const document = JSON.parse(await readFile(filename, 'utf8'))
  for (const item of document.resources) {
    if (['paper', 'overlay', 'decoration', 'model', 'scene'].includes(item.type) && item.assetPath && !item.previewPath) item.previewPath = item.assetPath
    if (item.assetPath) Object.assign(item, await metadata(item.assetPath))
    if (item.previewPath) {
      item.previewMimeType = item.previewPath.endsWith('.webp') ? 'image/webp' : item.previewPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
      const preview = await metadata(item.previewPath)
      item.previewByteSize = preview.byteSize
      item.previewSha256 = preview.sha256
      if (!item.details.previewWidth || !item.details.previewHeight) {
        if (item.previewPath === item.assetPath && item.details.width && item.details.height) {
          item.details.previewWidth = item.details.width
          item.details.previewHeight = item.details.height
        } else {
          const size = await dimensions(path.join(root, item.previewPath))
          item.details.previewWidth = size.width
          item.details.previewHeight = size.height
        }
      }
    }
  }
  await writeFile(filename, `${JSON.stringify(document, null, 2)}\n`)
}

console.log('资源大小、哈希和预览尺寸已同步。')
