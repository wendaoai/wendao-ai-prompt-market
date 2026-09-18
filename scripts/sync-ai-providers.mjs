import { writeFile } from "node:fs/promises";
import path from "node:path";

const sourceURL = "https://models.dev/api.json";
const outputPath = path.resolve(import.meta.dirname, "../data/catalogs/ai-providers.json");
const profiles = {
  deepseek: ["DeepSeek", "https://api.deepseek.com", "openai_compatible", "openai_compatible_chat"],
  openai: ["OpenAI", "https://api.openai.com/v1", "openai_compatible", "openai_compatible_chat", true],
  anthropic: ["Anthropic", "https://api.anthropic.com", "anthropic", "anthropic_chat", true],
  xai: ["xAI", "https://api.x.ai/v1", "openai_compatible", "openai_compatible_chat", true],
  "alibaba-cn": ["阿里云百炼", "https://dashscope.aliyuncs.com/compatible-mode/v1", "openai_compatible", "openai_compatible_chat"],
  volcengine: ["火山方舟", "https://ark.cn-beijing.volces.com/api/v3", "openai_compatible", "openai_compatible_chat"],
  zhipuai: ["智谱 AI", "https://open.bigmodel.cn/api/paas/v4", "openai_compatible", "openai_compatible_chat"],
  "moonshotai-cn": ["Moonshot", "https://api.moonshot.cn/v1", "openai_compatible", "openai_compatible_chat"],
  modelscope: ["魔搭", "https://api-inference.modelscope.cn/v1", "openai_compatible", "openai_compatible_chat"],
  "siliconflow-cn": ["硅基流动", "https://api.siliconflow.cn/v1", "openai_compatible", "openai_compatible_chat"],
};

function normalizeModel(model) {
  return {
    id: model.id, name: model.name || model.id, description: model.description || "", family: model.family || "",
    input: model.modalities?.input || [], output: model.modalities?.output || [], context: model.limit?.context || 0,
    maxOutput: model.limit?.output || 0, reasoning: Boolean(model.reasoning), toolCall: Boolean(model.tool_call),
    structuredOutput: Boolean(model.structured_output), attachment: Boolean(model.attachment),
    releaseDate: model.release_date || "", lastUpdated: model.last_updated || "", openWeights: Boolean(model.open_weights),
  };
}

const response = await fetch(sourceURL, { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`models.dev 返回 HTTP ${response.status}`);
const upstream = await response.json();
const generatedAt = new Date().toISOString();
const resources = Object.entries(profiles).map(([providerID, profile]) => {
  const provider = upstream[providerID];
  if (!provider) throw new Error(`models.dev 缺少服务商 ${providerID}`);
  const models = Object.values(provider.models || {}).map(normalizeModel).sort((a, b) => a.name.localeCompare(b.name));
  if (!models.length) throw new Error(`服务商 ${providerID} 没有模型`);
  return {
    id: `ai-provider-${providerID.replace(/[^a-z0-9]+/g, "-")}`, type: "ai-provider", version: "1.0.0",
    name: profile[0], description: `${profile[0]} 的 AI 模型目录`, tags: [...new Set(models.flatMap((model) => model.output))],
    license: "models.dev dataset", licenseURL: "https://github.com/sst/models.dev", attribution: "models.dev",
    featured: ["deepseek", "openai", "anthropic", "alibaba-cn"].includes(providerID), updatedAt: generatedAt,
    details: {
      providerId: providerID, sourceName: provider.name, sourceURL, apiBaseUrl: profile[1], providerType: profile[2],
      adapterKey: profile[3], authType: profile[2] === "anthropic" ? "x-api-key" : "bearer", modelsPath: "/models",
      supportsModelList: true, nativeWebSearch: Boolean(profile[4]), models,
    },
  };
});

await writeFile(outputPath, `${JSON.stringify({ schemaVersion: 2, type: "ai-providers", version: "1.0.0", generatedAt, sourceURL, resources }, null, 2)}\n`);
console.log(`已同步 ${resources.length} 家服务商、${resources.reduce((sum, item) => sum + item.details.models.length, 0)} 个模型。`);
