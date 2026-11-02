import { crc32, inflateRawSync } from 'node:zlib'

export const maxModelBytes = 100 * 1024 * 1024

export function validateModelPackage(buffer) {
  if (!buffer.length || buffer.length > maxModelBytes) throw new Error('模特 ZIP 超过 100 MB 或为空')
  if (buffer.length < 22) throw new Error('模特 ZIP 目录无效')
  let end = buffer.length - 22
  const minimum = Math.max(0, end - 65535)
  while (end >= minimum && buffer.readUInt32LE(end) !== 0x06054b50) end--
  if (end < minimum || end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length) throw new Error('模特 ZIP 目录无效')
  const count = buffer.readUInt16LE(end + 10)
  if (!count || count > 110 || buffer.readUInt32LE(end + 16) + buffer.readUInt32LE(end + 12) !== end) throw new Error('模特 ZIP 文件数量或目录无效')
  const files = new Map()
  let offset = buffer.readUInt32LE(end + 16)
  let total = 0
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('模特 ZIP 目录损坏')
    const method = buffer.readUInt16LE(offset + 10)
    const checksum = buffer.readUInt32LE(offset + 16)
    const compressed = buffer.readUInt32LE(offset + 20)
    const size = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const next = offset + 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    if (next > end || /[\\:]/.test(name) || name.split('/').some((part) => !part || part === '.' || part === '..') || files.has(name)) throw new Error('模特 ZIP 路径无效或重复')
    if (!['manifest.json', 'model.json', 'shots.json', 'generations.json'].includes(name) && !/^images\/.+\.(png|jpe?g|webp|gif)$/i.test(name)) throw new Error(`模特 ZIP 包含未知文件：${name}`)
    total += size
    if (total > maxModelBytes || (name.startsWith('images/') && size > 25 * 1024 * 1024)) throw new Error('模特 ZIP 解压大小超限')
    const local = buffer.readUInt32LE(offset + 42)
    if (local + 30 > offset || buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local + 6) & 1) throw new Error('模特 ZIP 文件头无效或已加密')
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    if (buffer.readUInt16LE(local + 8) !== method || buffer.toString('utf8', local + 30, local + 30 + buffer.readUInt16LE(local + 26)) !== name) throw new Error('模特 ZIP 文件头与目录不一致')
    if (start + compressed > offset) throw new Error('模特 ZIP 文件内容越界')
    const packed = buffer.subarray(start, start + compressed)
    const data = method === 0 ? packed : method === 8 ? inflateRawSync(packed, { maxOutputLength: Math.max(1, size) }) : null
    if (!data || data.length !== size) throw new Error('模特 ZIP 压缩方式或解压大小无效')
    if (name.startsWith('images/') && !data.length) throw new Error('模特 ZIP 图片为空')
    if (crc32(data) !== checksum) throw new Error('模特 ZIP 文件校验失败')
    files.set(name, data)
    offset = next
  }
  if (offset !== end) throw new Error('模特 ZIP 目录长度无效')
  const manifest = JSON.parse(files.get('manifest.json')?.toString() || 'null')
  const model = JSON.parse(files.get('model.json')?.toString() || 'null')
  const shots = JSON.parse(files.get('shots.json')?.toString() || 'null')
  if (manifest?.schemaVersion !== 1 || manifest?.product !== 'content-workbench-model') throw new Error('不是工作台导出的模特 ZIP')
  validateModelData(model, shots, files)
  for (const image of [model.imageFile, ...shots.map((shot) => shot.imageFile)].filter(Boolean).map((value) => value.trim())) {
    if (!image.startsWith('images/') || !files.get(image)?.length) throw new Error(`模特 ZIP 缺少图片：${image}`)
  }
  return model
}

const bodyParts = ['full_body', 'upper_body', 'lower_body', 'head', 'hand', 'foot', 'ear', 'neck', 'wrist', 'lips', 'face', 'nails', 'hair', 'custom']
const views = ['front', 'side', 'back', 'three_quarter', 'detail']
const runeLength = (value) => [...value].length
const stringList = (value, limit = Infinity) => value === undefined || (Array.isArray(value) && value.length <= limit && value.every((item) => typeof item === 'string'))

function validateDefinition(item) {
  if (!item || !bodyParts.includes(item.bodyPart) || typeof item.view !== 'string' || (item.bodyPart === 'custom' ? !item.view || Buffer.byteLength(item.view) > 64 : !views.includes(item.view))) throw new Error('模特 ZIP 部位与视角无效')
}

function validateModelData(model, shots, files) {
  if (typeof model?.name !== 'string' || !model.name.trim() || runeLength(model.name) > 200 || !Array.isArray(shots) || shots.length > 100) throw new Error('模特 ZIP 资料无效')
  for (const key of ['description', 'sourceType', 'usagePolicy', 'imageFile']) {
    if (model[key] != null && typeof model[key] !== 'string') throw new Error('模特 ZIP 资料格式无效')
  }
  if (runeLength(model.description || '') > 20000 || Buffer.byteLength(model.sourceType || '') > 200 || Buffer.byteLength(model.usagePolicy || '') > 200 || !stringList(model.tags) || (model.tags !== undefined && Buffer.byteLength(JSON.stringify(model.tags)) > 65536)) throw new Error('模特 ZIP 资料过长或标签无效')
  if (model.roles != null && (!stringList(model.roles, 32) || model.roles.some((role) => role.trim().length > 64))) throw new Error('模特 ZIP 角色无效')
  if (model.measurements !== undefined) {
    const measurements = model.measurements
    if (!measurements || typeof measurements !== 'object' || Array.isArray(measurements) || Object.keys(measurements).some((key) => !['heightCm', 'weightKg'].includes(key))) throw new Error('模特 ZIP 身高体重格式无效')
    for (const [key, maximum] of [['heightCm', 300], ['weightKg', 1000]]) {
      const value = measurements[key]
      if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > maximum)) throw new Error('模特 ZIP 身高体重数值无效')
    }
  }
  const seen = new Set()
  for (const shot of shots) {
    if (!shot || typeof shot.bodyPart !== 'string' || typeof shot.view !== 'string') throw new Error('模特 ZIP 参考图参数无效')
    validateDefinition({ bodyPart: shot.bodyPart.trim(), view: shot.view.trim() })
    const key = `${shot.bodyPart.trim()}\0${shot.view.trim()}`
    if (seen.has(key)) throw new Error('模特 ZIP 参考图重复')
    seen.add(key)
    for (const field of ['source', 'status', 'label', 'notes']) {
      if (shot[field] != null && typeof shot[field] !== 'string') throw new Error('模特 ZIP 参考图资料格式无效')
    }
    if (typeof shot.imageFile !== 'string' || !shot.imageFile.trim() || !['uploaded', 'generated', 'official'].includes(shot.source?.trim() || 'uploaded') || !['approved', 'disabled', 'outdated'].includes(shot.status?.trim() || 'approved') || !stringList(shot.roles) || !stringList(shot.tags, 32) || runeLength(shot.notes || '') > 2000 || (shot.sortOrder != null && !Number.isSafeInteger(shot.sortOrder))) throw new Error('模特 ZIP 参考图资料无效')
  }
  if (files.has('generations.json')) {
    const generations = JSON.parse(files.get('generations.json').toString())
    if (!Array.isArray(generations) || generations.length > 100) throw new Error('模特 ZIP 生成历史无效')
    for (const generation of generations) {
      validateDefinition(generation)
      for (const field of ['label', 'modelRef', 'notes', 'prompt', 'status', 'errorMessage', 'createdAt', 'updatedAt']) {
        if (generation[field] != null && typeof generation[field] !== 'string') throw new Error('模特 ZIP 生成历史格式无效')
      }
      if (generation.anchorVersion != null && !Number.isSafeInteger(generation.anchorVersion)) throw new Error('模特 ZIP 生成历史版本无效')
    }
  }
}
