import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const allowedTypes = new Set(["prompt", "prompt-style", "font", "paper", "overlay", "decoration", "model", "scene", "ai-provider"]);
const expectedCatalogs = new Set(["prompts", "prompt-styles", "fonts", "papers", "overlays", "decorations", "models", "scenes", "ai-providers"]);
const errors = [];
const ids = new Set();
const paths = new Map();
const referenced = new Set();

function fail(message) { errors.push(message); }
function validateSchema(value, schema, location) {
  if (schema.const !== undefined && value !== schema.const) fail(`${location}: 不符合 const 约束`);
  if (schema.enum && !schema.enum.includes(value)) fail(`${location}: 不在允许枚举中`);
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) { fail(`${location}: 必须是对象`); return; }
    for (const key of schema.required || []) if (!(key in value)) fail(`${location}: 缺少字段 ${key}`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in (schema.properties || {}))) fail(`${location}: 未知字段 ${key}`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) if (key in value) validateSchema(value[key], child, `${location}.${key}`);
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) { fail(`${location}: 必须是数组`); return; }
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`${location}: 数量不足`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`${location}: 数量超限`);
    value.forEach((item, index) => validateSchema(item, schema.items || {}, `${location}[${index}]`));
    return;
  }
  if (schema.type === "string" && typeof value !== "string") fail(`${location}: 必须是字符串`);
  if (schema.type === "integer" && !Number.isInteger(value)) fail(`${location}: 必须是整数`);
  if (schema.type === "boolean" && typeof value !== "boolean") fail(`${location}: 必须是布尔值`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(`${location}: 字符串过短`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(`${location}: 字符串过长`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(`${location}: 格式不匹配`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) fail(`${location}: 不是合法日期时间`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`${location}: 数值过小`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`${location}: 数值过大`);
  }
}
function safeRelative(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240 && !value.startsWith("/") && !/[\\:?#]/.test(value) && !value.split("/").includes("..");
}
async function json(relativePath, maxBytes) {
  const filename = path.join(root, relativePath);
  const info = await stat(filename).catch(() => null);
  if (!info || !info.isFile()) throw new Error(`${relativePath} 不存在`);
  if (info.size > maxBytes) throw new Error(`${relativePath} 超过 ${maxBytes} 字节限制`);
  return JSON.parse(await readFile(filename, "utf8"));
}
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
function imageSize(buffer, filename) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), mime: "image/png" };
  if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 255) { offset++; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), mime: "image/jpeg" };
      offset += 2 + length;
    }
  }
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const kind = buffer.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3), mime: "image/webp" };
    if (kind === "VP8 ") return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff, mime: "image/webp" };
    if (kind === "VP8L") {
      const bits = buffer.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), mime: "image/webp" };
    }
  }
  throw new Error(`${filename} 不是受支持或可解码的图片`);
}
async function validateFile(item, field, sizeField, hashField) {
  const relativePath = item[field];
  if (!relativePath) return;
  const allowedRoot = field === "previewPath" ? ["assets/", "previews/"] : ["assets/"];
  if (!safeRelative(relativePath) || !allowedRoot.some((prefix) => relativePath.startsWith(prefix))) { fail(`${item.id}: ${field} 路径不安全`); return; }
  if (paths.has(relativePath) && paths.get(relativePath) !== item.id && item.type !== "prompt-style") fail(`${item.id}: 文件路径重复 ${relativePath}`);
  paths.set(relativePath, item.id); referenced.add(relativePath);
  const buffer = await readFile(path.join(root, relativePath)).catch(() => null);
  if (!buffer) { fail(`${item.id}: 文件不存在 ${relativePath}`); return; }
  if (buffer.length !== item[sizeField]) fail(`${item.id}: ${sizeField} 不匹配`);
  if (sha256(buffer) !== item[hashField]) fail(`${item.id}: ${hashField} 不匹配`);
  if (item.type === "font" && field === "assetPath") {
    if (buffer.toString("ascii", 0, 4) !== "wOF2" || item.mimeType !== "font/woff2") fail(`${item.id}: 字体不是合法 WOFF2`);
    return;
  }
  try {
    const dimensions = imageSize(buffer, relativePath);
    const declaredMime = field === "previewPath" ? item.previewMimeType : item.mimeType;
    if (dimensions.mime !== declaredMime) fail(`${item.id}: MIME 与文件内容不一致`);
    if (dimensions.width * dimensions.height > 40_000_000) fail(`${item.id}: 图片像素超过限制`);
    const declaredWidth = field === "previewPath" ? (item.details?.previewWidth || item.details?.width) : item.details?.width;
    const declaredHeight = field === "previewPath" ? (item.details?.previewHeight || item.details?.height) : item.details?.height;
    if (declaredWidth !== dimensions.width || declaredHeight !== dimensions.height) fail(`${item.id}: 图片尺寸声明不一致`);
  } catch (error) { fail(error.message); }
}

const manifestSchema = await json("schemas/manifest.schema.json", 128 * 1024);
const resourceSchema = await json("schemas/resource.schema.json", 128 * 1024);
const manifest = await json("data/manifest.json", 64 * 1024);
validateSchema(manifest, manifestSchema, "manifest");
if (manifest.schemaVersion !== 2 || manifest.marketId !== "wendao-ai-resource-market") fail("manifest schemaVersion 或 marketId 无效");
if (!Array.isArray(manifest.catalogs) || manifest.catalogs.length !== expectedCatalogs.size) fail("manifest catalogs 数量无效");
const resources = [];
const taxonomy = await json(`data/${manifest.taxonomyPath}`, 128 * 1024);
if (taxonomy.schemaVersion !== 2 || !taxonomy.categories || !taxonomy.styles || !taxonomy.scenes) fail("中文 taxonomy 格式无效");
for (const descriptor of manifest.catalogs || []) {
  if (!expectedCatalogs.delete(descriptor.type)) fail(`未知或重复目录类型: ${descriptor.type}`);
  if (!safeRelative(descriptor.path) || !descriptor.path.startsWith("catalogs/")) { fail(`目录路径不安全: ${descriptor.path}`); continue; }
  const document = await json(`data/${descriptor.path}`, 16 * 1024 * 1024);
  if (document.schemaVersion !== 2 || document.version !== descriptor.version || !Array.isArray(document.resources)) fail(`${descriptor.path}: 目录头无效`);
  if (document.resources?.length > 2000) fail(`${descriptor.path}: 资源数量超过限制`);
  resources.push(...(document.resources || []));
}
if (expectedCatalogs.size) fail(`缺少目录: ${[...expectedCatalogs].join(", ")}`);

for (const item of resources) {
  validateSchema(item, resourceSchema, `resource:${item.id || "unknown"}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id || "") || item.id.length > 100 || ids.has(item.id)) fail(`资源 ID 无效或重复: ${item.id}`);
  ids.add(item.id);
  if (!allowedTypes.has(item.type)) fail(`${item.id}: 未知资源类型`);
  if (!item.name || item.name.length > 120 || !item.version || !item.license || !item.attribution || !item.details) fail(`${item.id}: 缺少必要字段`);
  if (!Array.isArray(item.tags) || item.tags.length > 40) fail(`${item.id}: tags 无效`);
  if (["font", "paper", "overlay", "decoration", "model", "scene"].includes(item.type) && !item.assetPath) fail(`${item.id}: 可安装资源缺少 assetPath`);
  if (item.type === "font" && (item.details?.format !== "woff2" || !item.details?.family || !item.details?.displayName)) fail(`${item.id}: 字体 details 无效`);
  if (item.previewPath && !["image/webp", "image/png", "image/jpeg"].includes(item.previewMimeType)) fail(`${item.id}: 预览 MIME 无效`);
  if (item.type === "font" && (!safeRelative(item.details?.licenseFile || "") || !item.details.licenseFile.startsWith("licenses/fonts/"))) fail(`${item.id}: 字体许可证路径无效`);
  if (item.type === "font" && item.details?.licenseFile) {
    const license = await stat(path.join(root, item.details.licenseFile)).catch(() => null);
    if (!license?.isFile()) fail(`${item.id}: 字体许可证不存在`);
  }
  if (item.type === "model" || item.type === "scene") {
    if (!item.previewPath) fail(`${item.id}: 官方视觉资产缺少 previewPath`);
    if (!Number.isInteger(item.details?.width) || !Number.isInteger(item.details?.height)) fail(`${item.id}: 官方视觉资产缺少图片尺寸`);
  }
  if (item.type === "prompt") {
    if (!taxonomy.categories[item.details?.category]) fail(`${item.id}: 分类不存在 ${item.details?.category}`);
    for (const style of item.details?.styles || []) if (!taxonomy.styles[style]) fail(`${item.id}: 风格不存在 ${style}`);
    for (const scene of item.details?.scenes || []) if (!taxonomy.scenes[scene]) fail(`${item.id}: 场景不存在 ${scene}`);
  }
  if (item.type === "ai-provider") {
    const details = item.details || {};
    if (!details.providerId || !details.protocol || typeof details.configurable !== "boolean") fail(`${item.id}: AI 服务商协议声明无效`);
    if (details.configurable && (!details.apiBaseUrl || !["openai_compatible", "anthropic"].includes(details.providerType) || !details.adapterKey)) fail(`${item.id}: AI 服务商连接配置无效`);
    if (!Array.isArray(details.models) || details.models.length < 1 || details.models.length > 2000) fail(`${item.id}: AI 服务商模型列表无效`);
    const modelIDs = new Set();
    for (const model of details.models || []) {
      if (!model.id || model.id.length > 180 || modelIDs.has(model.id)) fail(`${item.id}: 模型 ID 无效或重复`);
      modelIDs.add(model.id);
      if (!Array.isArray(model.input) || !Array.isArray(model.output)) fail(`${item.id}/${model.id}: 模型模态无效`);
    }
  }
  await validateFile(item, "assetPath", "byteSize", "sha256");
  await validateFile(item, "previewPath", "previewByteSize", "previewSha256");
}

const promptIDs = new Set(resources.filter((item) => item.type === "prompt").map((item) => item.id));
for (const item of resources.filter((entry) => entry.type === "prompt-style")) {
  for (const id of item.details?.examplePrompts || []) if (!promptIDs.has(id)) fail(`${item.id}: 引用了不存在的提示词 ${id}`);
}
const assetFiles = [];
async function walk(directory) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) await walk(relative); else assetFiles.push(relative);
  }
}
await walk("assets");
for (const file of assetFiles) if (!referenced.has(file) && !file.endsWith("banner.svg") && !file.startsWith("assets/models/") && !file.startsWith("assets/scenes/") && !file.includes("/category-covers/") && !file.includes("/sponsors/")) fail(`孤立资源: ${file}`);
if (errors.length) {
  console.error(errors.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log(`资源市场校验通过：${resources.length} 项，${assetFiles.length} 个资产文件。`);
