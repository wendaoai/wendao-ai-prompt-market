import { writeFile } from "node:fs/promises";
import path from "node:path";

const sourceURL = "https://models.dev/api.json";
const outputPath = path.resolve(import.meta.dirname, "../data/catalogs/ai-providers.json");
const profileOverrides = {
  deepseek: ["DeepSeek", "https://api.deepseek.com", "openai_compatible", "openai_compatible_chat"],
  openai: ["OpenAI", "https://api.openai.com/v1", "openai_compatible", "openai_compatible_chat", true],
  anthropic: ["Anthropic", "https://api.anthropic.com", "anthropic", "anthropic_chat", true],
  xai: ["xAI", "https://api.x.ai/v1", "openai_compatible", "openai_compatible_chat", true],
  "alibaba-cn": ["阿里云百炼", "https://dashscope.aliyuncs.com/compatible-mode/v1", "openai_compatible", "openai_compatible_chat"],
  "alibaba-token-plan-cn": ["阿里云百炼 Token Plan", "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", "openai_compatible", "openai_compatible_chat"],
  volcengine: ["火山方舟", "https://ark.cn-beijing.volces.com/api/v3", "openai_compatible", "openai_compatible_chat"],
  zhipuai: ["智谱 AI", "https://open.bigmodel.cn/api/paas/v4", "openai_compatible", "openai_compatible_chat"],
  "moonshotai-cn": ["Moonshot", "https://api.moonshot.cn/v1", "openai_compatible", "openai_compatible_chat"],
  modelscope: ["魔搭", "https://api-inference.modelscope.cn/v1", "openai_compatible", "openai_compatible_chat"],
  "siliconflow-cn": ["硅基流动", "https://api.siliconflow.cn/v1", "openai_compatible", "openai_compatible_chat"],
};

const supplementalModels = {
  // models.dev publishes the OpenAI-compatible image models under Token Plan,
  // while the workbench exposes them as capabilities of the Bailian provider.
  "alibaba-cn": [{ providerID: "alibaba-token-plan-cn", output: "image" }],
  // Vercel Gateway keeps OpenAI namespaced image models that are useful for
  // OpenAI-compatible gateways but are absent from the official OpenAI entry.
  openai: [{ providerID: "vercel", output: "image", idPrefix: "openai/", family: "gpt-image" }],
};

const curatedModels = {
  openai: [
    {
      id: "dall-e-3", name: "DALL-E 3", description: "OpenAI image generation model with strong prompt adherence",
      family: "dall-e", modalities: { input: ["text"], output: ["image"] }, release_date: "2023-10-01", last_updated: "2023-10-01",
    },
    {
      id: "dall-e-2", name: "DALL-E 2", description: "OpenAI image generation and editing model",
      family: "dall-e", modalities: { input: ["text", "image"], output: ["image"] }, release_date: "2022-11-03", last_updated: "2022-11-03", attachment: true,
    },
  ],
};

const preferredModels = {
  openai: [
    "openai/gpt-image-2.5-sunburst", "openai/gpt-image-2.5-flare", "gpt-image-2", "openai/gpt-image-2",
    "gpt-image-1.5", "openai/gpt-image-1.5", "chatgpt-image-latest", "gpt-image-1", "openai/gpt-image-1",
    "gpt-image-1-mini", "openai/gpt-image-1-mini", "dall-e-3", "dall-e-2",
  ],
};

function connectionProfile(providerID, provider) {
  if (provider.npm === "@ai-sdk/openai-compatible" || provider.npm === "@ai-sdk/openai") {
    return profileOverrides[providerID] || [provider.name || providerID, provider.api || "", "openai_compatible", "openai_compatible_chat"];
  }
  if (provider.npm === "@ai-sdk/anthropic") {
    return profileOverrides[providerID] || [provider.name || providerID, provider.api || "", "anthropic", "anthropic_chat"];
  }
  return [provider.name || providerID, provider.api || "", "unsupported", ""];
}

function normalizeModel(model) {
  return {
    id: model.id, name: model.name || model.id, description: model.description || "", family: model.family || "",
    input: model.modalities?.input || [], output: model.modalities?.output || [], context: model.limit?.context || 0,
    maxOutput: model.limit?.output || 0, reasoning: Boolean(model.reasoning), toolCall: Boolean(model.tool_call),
    structuredOutput: Boolean(model.structured_output), attachment: Boolean(model.attachment),
    releaseDate: model.release_date || "", lastUpdated: model.last_updated || "", openWeights: Boolean(model.open_weights),
  };
}

function sortModels(providerID, models) {
  const preferred = new Map((preferredModels[providerID] || []).map((id, index) => [id, index]));
  return models.sort((a, b) => {
    const left = preferred.get(a.id);
    const right = preferred.get(b.id);
    if (left !== undefined || right !== undefined) return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER);
    return a.name.localeCompare(b.name);
  });
}

const response = await fetch(sourceURL, { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`models.dev 返回 HTTP ${response.status}`);
const upstream = await response.json();
const generatedAt = new Date().toISOString();
const providerEntries = Object.entries(upstream)
  .filter(([, provider]) => Object.keys(provider.models || {}).length > 0)
  .sort((left, right) => (profileOverrides[left[0]]?.[0] || left[1].name || left[0]).localeCompare(profileOverrides[right[0]]?.[0] || right[1].name || right[0]));

const resources = providerEntries.map(([providerID, provider]) => {
  const profile = connectionProfile(providerID, provider);
  const configurable = profile[2] !== "unsupported" && Boolean(profile[1]);
  const providerModels = Object.values(provider.models || {});
  const additions = (supplementalModels[providerID] || []).flatMap((supplement) => {
    const supplementalProvider = upstream[supplement.providerID];
    if (!supplementalProvider) throw new Error(`models.dev 缺少补充服务商 ${supplement.providerID}`);
    return Object.values(supplementalProvider.models || {}).filter((model) =>
      model.modalities?.output?.includes(supplement.output)
      && (!supplement.idPrefix || model.id.startsWith(supplement.idPrefix))
      && (!supplement.family || model.family === supplement.family));
  });
  const modelsByID = new Map([...providerModels, ...additions, ...(curatedModels[providerID] || [])].map((model) => [model.id, normalizeModel(model)]));
  const models = sortModels(providerID, [...modelsByID.values()]);
  if (!models.length) throw new Error(`服务商 ${providerID} 没有模型`);
  return {
    id: `ai-provider-${providerID.replace(/[^a-z0-9]+/g, "-")}`, type: "ai-provider", version: "1.0.0",
    name: profile[0], description: `${profile[0]} 的 AI 模型目录`, tags: [...new Set(models.flatMap((model) => model.output))],
    license: "models.dev dataset", licenseURL: "https://github.com/sst/models.dev", attribution: "models.dev",
    featured: ["deepseek", "openai", "anthropic", "alibaba-cn"].includes(providerID), updatedAt: generatedAt,
    details: {
      providerId: providerID, sourceName: provider.name, sourceURL, protocol: provider.npm || "unknown",
      configurable, apiBaseUrl: profile[1], providerType: profile[2], adapterKey: profile[3],
      authType: profile[2] === "anthropic" ? "x-api-key" : "bearer", modelsPath: "/models",
      supportsModelList: configurable, nativeWebSearch: Boolean(profile[4]), models,
    },
  };
});

await writeFile(outputPath, `${JSON.stringify({ schemaVersion: 2, type: "ai-providers", version: "1.0.0", generatedAt, sourceURL, resources }, null, 2)}\n`);
console.log(`已同步 ${resources.length} 家服务商、${resources.reduce((sum, item) => sum + item.details.models.length, 0)} 个模型。`);
