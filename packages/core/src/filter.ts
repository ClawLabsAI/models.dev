export const MODEL_TYPES = [
  "chat",
  "image",
  "video",
  "embedding",
  "reranking",
  "decision",
  "transcription",
  "speech",
  "realtime",
] as const;

export type ModelTypeValue = (typeof MODEL_TYPES)[number];
export type ModelTypeFilter = "default" | "all" | ModelTypeValue[];

export function normalizeModelType(
  rawType: string | undefined,
): ModelTypeValue | undefined {
  if (rawType === undefined) return undefined;
  const normalized = rawType.trim().toLowerCase().replaceAll("_", "-");
  switch (normalized) {
    case "chat":
    case "language":
    case "language-models":
    case "text":
    case "text-generation":
    case "completion":
    case "completions":
      return "chat";
    case "image":
    case "images":
    case "image-generation":
    case "image-generation-models":
    case "text-to-image":
    case "image-to-image":
      return "image";
    case "video":
    case "videos":
    case "video-generation":
    case "video-generation-models":
    case "text-to-video":
    case "image-to-video":
      return "video";
    case "embedding":
    case "embeddings":
    case "text-embedding":
    case "feature-extraction":
      return "embedding";
    case "rerank":
    case "reranker":
    case "reranking":
      return "reranking";
    case "decision":
    case "evaluation":
    case "classifier":
      return "decision";
    case "transcription":
    case "stt":
    case "asr":
    case "speech-to-text":
    case "automatic-speech-recognition":
      return "transcription";
    case "speech":
    case "tts":
    case "text-to-speech":
    case "audio-generation":
      return "speech";
    case "realtime":
      return "realtime";
    default:
      return undefined;
  }
}

export function inferModelType(options: {
  id?: string;
  rawType?: string;
  input?: readonly string[];
  output?: readonly string[];
  existingType?: ModelTypeValue;
}): ModelTypeValue {
  const explicit = normalizeModelType(options.rawType);
  if (explicit !== undefined && explicit !== "chat") return explicit;
  if (options.existingType !== undefined && options.existingType !== "chat") {
    return options.existingType;
  }

  const lowerId = options.id?.toLowerCase() ?? "";
  const input = options.input ?? [];
  const output = options.output ?? [];

  if (
    /(?:^|[/-])(?:rerank|reranker)(?:[/-]|$|\d)/i.test(lowerId) ||
    lowerId.includes("rerank")
  ) {
    return "reranking";
  }

  if (
    /(?:^|[/-])(?:embed|embedding|embeddings|text-embedding|bge-)(?:[/-]|$|\d)/i.test(
      lowerId,
    ) ||
    lowerId.includes("embedding")
  ) {
    return "embedding";
  }

  if (output.length === 1 && output[0] === "text") {
    if (
      (input.length === 1 && input[0] === "audio") ||
      /(?:^|[/-])(?:whisper|transcribe|stt|asr)(?:[/-]|$|\d)/i.test(lowerId) ||
      lowerId.includes("-transcribe") ||
      lowerId.includes("-stt") ||
      lowerId.includes("-asr")
    ) {
      return "transcription";
    }
  }

  if (
    /(?:^|[/-])realtime(?:[/-]|$|\d)/i.test(lowerId) ||
    lowerId.endsWith("-realtime") ||
    lowerId.includes("-realtime-") ||
    lowerId.includes("-live-preview") ||
    lowerId.includes("-live-translate") ||
    lowerId.endsWith("-live-1")
  ) {
    return "realtime";
  }

  if (output.includes("video") && !output.includes("text")) {
    return "video";
  }

  if (output.includes("image") && !output.includes("text")) {
    return "image";
  }

  if (output.includes("audio") && !output.includes("text")) {
    return "speech";
  }

  if (
    output.includes("image") &&
    output.includes("text") &&
    (/(?:^|[/-])(?:gpt-image|chatgpt-image|dall-e|imagen|flux|stable-diffusion|sdxl|ideogram|recraft|midjourney|grok-imagine-image|qwen-image|glm-image)/i.test(
      lowerId,
    ) ||
      lowerId.endsWith("-image") ||
      lowerId.includes("-image-preview") ||
      lowerId.includes("-image-mini") ||
      /image-\d/.test(lowerId) ||
      lowerId.includes("nano-banana"))
  ) {
    return "image";
  }

  if (
    output.includes("audio") &&
    output.includes("text") &&
    (/(?:^|[/-])(?:tts|lyria|elevenlabs)/i.test(lowerId) ||
      lowerId.includes("-tts"))
  ) {
    return "speech";
  }

  return explicit ?? options.existingType ?? "chat";
}

export function inferAuthoredModelType(options: {
  id?: string;
  rawType?: string;
  input?: readonly string[];
  output?: readonly string[];
  existingType?: ModelTypeValue;
}): ModelTypeValue | undefined {
  const inferred = inferModelType(options);
  if (inferred === "chat") {
    return options.existingType === "chat" ? "chat" : undefined;
  }
  return inferred;
}

interface TypedModel {
  type?: ModelTypeValue;
}

interface TypedProvider {
  models: Record<string, TypedModel>;
}

export class InvalidModelTypeError extends Error {
  constructor(value: string) {
    super(`Invalid type value: ${value}`);
    this.name = "InvalidModelTypeError";
  }
}

export function parseModelTypes(value: string | null): ModelTypeFilter {
  if (value === null || value === "") return "default";
  if (value === "all") return "all";

  const types = value.split(",");
  if (
    types.length === 0 ||
    types.includes("all") ||
    types.some((type) => !MODEL_TYPES.includes(type as ModelTypeValue))
  ) {
    throw new InvalidModelTypeError(value);
  }

  return [...new Set(types)] as ModelTypeValue[];
}

function includesModel(model: TypedModel, filter: ModelTypeFilter) {
  if (filter === "all") return true;
  if (filter === "default") return model.type !== "decision";
  const modelType = model.type ?? "chat";
  return filter.includes(modelType);
}

export function filterProvidersByModelType<
  T extends Record<string, TypedProvider>,
>(providers: T, filter: ModelTypeFilter): T {
  if (filter === "all") return providers;

  return Object.fromEntries(
    Object.entries(providers).flatMap(([providerID, provider]) => {
      const models = Object.fromEntries(
        Object.entries(provider.models).filter(([, model]) =>
          includesModel(model, filter),
        ),
      );
      return Object.keys(models).length === 0
        ? []
        : [[providerID, { ...provider, models }]];
    }),
  ) as T;
}

export function filterModelsByModelType<T extends Record<string, TypedModel>>(
  models: T,
  filter: ModelTypeFilter,
): T {
  if (filter === "all") return models;
  return Object.fromEntries(
    Object.entries(models).filter(([, model]) => includesModel(model, filter)),
  ) as T;
}

export function filterCatalogByModelType<
  TProviders extends Record<string, TypedProvider>,
  TModels extends Record<string, TypedModel>,
>(
  catalog: { providers: TProviders; models: TModels },
  filter: ModelTypeFilter,
): { providers: TProviders; models: TModels } {
  return {
    providers: filterProvidersByModelType(catalog.providers, filter),
    models: filterModelsByModelType(catalog.models, filter),
  };
}
