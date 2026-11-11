import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const filename = path.join(root, 'data/manifest-v3.json')
const manifest = JSON.parse(await readFile(filename, 'utf8'))
const sources = { fonts: 'wendao-ai-font-market', materials: 'wendao-ai-material-market', templates: 'wendao-ai-template-market' }
let changed = false
for (const descriptor of manifest.catalogs) {
  if (descriptor.source && !sources[descriptor.source]) throw new Error('Unknown source')
  const repositoryRoot = descriptor.source ? path.resolve(root, '..', sources[descriptor.source]) : root
  const bytes = await readFile(path.join(repositoryRoot, 'data', descriptor.path))
  const document = JSON.parse(bytes.toString('utf8'))
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (descriptor.sha256 !== digest || descriptor.count !== document.resources.length || descriptor.version !== document.version) changed = true
  Object.assign(descriptor, { version: document.version, sha256: digest, count: document.resources.length })
}
if (changed) {
  const version = manifest.marketVersion.split('.').map(Number)
  version[2] += 1
  manifest.marketVersion = version.join('.')
  manifest.generatedAt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(' ', 'T') + '+08:00'
  await writeFile(filename, JSON.stringify(manifest, null, 2) + '\n')
}
console.log(changed ? 'Updated catalog index and market version.' : 'Catalog index is current; no files changed.')
