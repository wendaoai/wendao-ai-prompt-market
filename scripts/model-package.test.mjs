import assert from 'node:assert/strict'
import { test } from 'node:test'
import { crc32 } from 'node:zlib'
import { validateModelPackage, maxModelBytes } from './model-package.mjs'

// Fixtures created with Python's standard zipfile writer, using DEFLATE.
const valid = Buffer.from('UEsDBBQAAAAIAG8CSl1OWSHsOQAAADcAAAANAAAAbWFuaWZlc3QuanNvbqtWKk7OSM1NDEstKs7Mz1OyMtRRKijKTylNLlGyUkrOzytJzSvRLc8vyk5KzUvO0M3NT0nNUaoFAFBLAwQUAAAACABvAkpdGvFE6SsAAAAvAAAACgAAAG1vZGVsLmpzb26rVspLzE1VslJyrUjMLchJVdJRysxNTE91y8wBiYLZxfoGBoZ6BXnpSrUAUEsDBBQAAAAIAG8CSl0pu0wNBAAAAAIAAAAKAAAAc2hvdHMuanNvbouOBQBQSwMEFAAAAAgAbwJKXV8EPcUHAAAABQAAAA4AAABpbWFnZXMvMDAxLnBuZ8vMTUxPBQBQSwECFAAUAAAACABvAkpdTlkh7DkAAAA3AAAADQAAAAAAAAAAAAAAgAEAAAAAbWFuaWZlc3QuanNvblBLAQIUABQAAAAIAG8CSl0a8UTpKwAAAC8AAAAKAAAAAAAAAAAAAACAAWQAAABtb2RlbC5qc29uUEsBAhQAFAAAAAgAbwJKXSm7TA0EAAAAAgAAAAoAAAAAAAAAAAAAAIABtwAAAHNob3RzLmpzb25QSwECFAAUAAAACABvAkpdXwQ9xQcAAAAFAAAADgAAAAAAAAAAAAAAgAHjAAAAaW1hZ2VzLzAwMS5wbmdQSwUGAAAAAAQABADnAAAAFgEAAAAA', 'base64')
const wrongProduct = Buffer.from('UEsDBBQAAAAIAG8CSl0yQx+rJwAAACUAAAANAAAAbWFuaWZlc3QuanNvbqtWKk7OSM1NDEstKs7Mz1OyMtRRKijKTylNLlGyUsovyUgtUqoFAFBLAwQUAAAACABvAkpdGvFE6SsAAAAvAAAACgAAAG1vZGVsLmpzb26rVspLzE1VslJyrUjMLchJVdJRysxNTE91y8wBiYLZxfoGBoZ6BXnpSrUAUEsDBBQAAAAIAG8CSl0pu0wNBAAAAAIAAAAKAAAAc2hvdHMuanNvbouOBQBQSwMEFAAAAAgAbwJKXV8EPcUHAAAABQAAAA4AAABpbWFnZXMvMDAxLnBuZ8vMTUxPBQBQSwECFAAUAAAACABvAkpdMkMfqycAAAAlAAAADQAAAAAAAAAAAAAAgAEAAAAAbWFuaWZlc3QuanNvblBLAQIUABQAAAAIAG8CSl0a8UTpKwAAAC8AAAAKAAAAAAAAAAAAAACAAVIAAABtb2RlbC5qc29uUEsBAhQAFAAAAAgAbwJKXSm7TA0EAAAAAgAAAAoAAAAAAAAAAAAAAIABpQAAAHNob3RzLmpzb25QSwECFAAUAAAACABvAkpdXwQ9xQcAAAAFAAAADgAAAAAAAAAAAAAAgAHRAAAAaW1hZ2VzLzAwMS5wbmdQSwUGAAAAAAQABADnAAAABAEAAAAA', 'base64')

test('accepts an exported model package and rejects unrelated archives', () => {
  assert.equal(validateModelPackage(valid).name, 'Example')
  assert.throws(() => validateModelPackage(wrongProduct), /工作台导出/)
  assert.throws(() => validateModelPackage(Buffer.from('not a ZIP')), /目录无效/)
  const corrupt = Buffer.from(valid)
  const directory = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  corrupt.writeUInt32LE(0, directory + 16)
  assert.throws(() => validateModelPackage(corrupt), /文件校验失败/)
})

test('rejects unsafe filenames and oversized expanded packages', () => {
  const traversal = Buffer.from(valid)
  const original = Buffer.from('images/001.png')
  for (let position = traversal.indexOf(original); position !== -1; position = traversal.indexOf(original, position + 1)) {
    Buffer.from('../secret.json').copy(traversal, position)
  }
  assert.throws(() => validateModelPackage(traversal), /路径无效/)
  const oversized = Buffer.from(valid)
  const directory = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  oversized.writeUInt32LE(maxModelBytes + 1, directory + 24)
  assert.throws(() => validateModelPackage(oversized), /解压大小超限/)
})

function packageFixture(overrides = {}) {
  const files = {
    'manifest.json': '{"schemaVersion":1,"product":"content-workbench-model"}',
    'model.json': '{"name":"模特","imageFile":"images/001.png"}',
    'shots.json': '[]', 'images/001.png': 'image', ...overrides,
  }
  const entries = [], directory = []
  let offset = 0
  for (const [filename, content] of Object.entries(files)) {
    const name = Buffer.from(filename), data = Buffer.from(content)
    const header = Buffer.alloc(30), central = Buffer.alloc(46)
    header.writeUInt32LE(0x04034b50)
    header.writeUInt32LE(crc32(data), 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(name.length, 26)
    central.writeUInt32LE(0x02014b50)
    central.writeUInt32LE(crc32(data), 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    entries.push(header, name, data)
    directory.push(central, name)
    offset += header.length + name.length + data.length
  }
  const end = Buffer.alloc(22), catalog = Buffer.concat(directory)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(catalog.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...entries, catalog, end])
}

test('rejects content that the workbench cannot import', () => {
  for (const overrides of [
    { 'generations.json': 'not JSON' },
    { 'generations.json': '' },
    { 'generations.json': '[{"bodyPart":"unknown","view":"front"}]' },
    { 'generations.json': '[{"bodyPart":"custom","view":""}]' },
    { 'generations.json': JSON.stringify(Array(101).fill({ bodyPart: 'head', view: 'front' })) },
    { 'model.json': '{"name":"模特","measurements":{"heightCm":-1}}' },
    { 'model.json': '{"name":"模特","measurements":{"unknown":1}}' },
    { 'model.json': '{"name":"模特","tags":{}}' },
    { 'model.json': JSON.stringify({ name: '模特', roles: ['中'.repeat(65)] }) },
    { 'model.json': JSON.stringify({ name: '模特', roles: Array(33).fill('person') }) },
    { 'model.json': '{"name":"模特","roles":{}}' },
    { 'shots.json': '[{"bodyPart":"unknown","view":"front","imageFile":"images/001.png"}]' },
    { 'shots.json': '[{"bodyPart":"head","view":"front","imageFile":"images/001.png","source":"other"}]' },
    { 'shots.json': '[{"bodyPart":"head","view":"front"}]' },
    { 'shots.json': JSON.stringify(Array(2).fill({ bodyPart: 'head', view: 'front', imageFile: 'images/001.png' })) },
  ]) assert.throws(() => validateModelPackage(packageFixture(overrides)))
})

test('accepts custom references, Chinese notes and optional generation history', () => {
  const shot = { bodyPart: 'custom', view: '商品互动', imageFile: 'images/001.png', notes: '中'.repeat(1000) }
  assert.equal(validateModelPackage(packageFixture({
    'shots.json': JSON.stringify([shot]),
    'generations.json': '[{"bodyPart":"custom","view":"商品互动"}]',
  })).name, '模特')
})

test('preserves optional model roles including an explicitly empty selection', () => {
  for (const roles of [['person', 'wearer'], [], null]) {
    const model = validateModelPackage(packageFixture({ 'model.json': JSON.stringify({ name: '模特', roles }) }))
    assert.deepEqual(model.roles, roles)
  }
})
