import { describe, expect, test } from "bun:test";

import {
  filterCatalogByModelType,
  generateCatalog,
  inferAuthoredModelType,
  inferModelType,
  InvalidModelTypeError,
  MODEL_TYPES,
  normalizeModelType,
  parseModelTypes,
} from "../src/index.js";
import type { ModelMetadata, Provider } from "../src/index.js";
import path from "node:path";

describe("model type filtering", () => {
  test("defaults to non-decision models and supports specific types and all", () => {
    expect(parseModelTypes(null)).toBe("default");
    expect(parseModelTypes("")).toBe("default");
    expect(parseModelTypes("decision")).toEqual(["decision"]);
    expect(parseModelTypes("image,video")).toEqual(["image", "video"]);
    expect(parseModelTypes("all")).toBe("all");
    for (const type of MODEL_TYPES) {
      expect(parseModelTypes(type)).toEqual([type]);
    }
  });

  test("normalizes and infers model types across v1 and v2 shapes", () => {
    expect(normalizeModelType("language")).toBe("chat");
    expect(normalizeModelType("evaluation")).toBe("decision");
    expect(normalizeModelType("image-generation-models")).toBe("image");
    expect(normalizeModelType("video-generation-models")).toBe("video");
    expect(normalizeModelType("text-to-speech")).toBe("speech");
    expect(normalizeModelType("automatic-speech-recognition")).toBe("transcription");

    expect(inferModelType({ id: "openai/gpt-image-2", input: ["text", "image"], output: ["image"] })).toBe("image");
    expect(inferModelType({ id: "google/veo-3.1", input: ["text"], output: ["video"] })).toBe("video");
    expect(inferModelType({ id: "openai/whisper-large-v3", input: ["audio"], output: ["text"] })).toBe("transcription");
    expect(inferModelType({ id: "openai/tts-1", input: ["text"], output: ["audio"] })).toBe("speech");
    expect(inferModelType({ id: "openai/gpt-realtime-2.1", input: ["text", "audio"], output: ["text", "audio"] })).toBe("realtime");
    expect(inferModelType({ id: "openai/text-embedding-3-large", input: ["text"], output: ["text"] })).toBe("embedding");
    expect(inferModelType({ id: "cohere/rerank-v3.5", input: ["text"], output: ["text"] })).toBe("reranking");
    expect(inferModelType({ id: "anthropic/claude-opus-4-6", input: ["text", "image"], output: ["text"] })).toBe("chat");

    expect(inferAuthoredModelType({ id: "anthropic/claude-opus-4-6", input: ["text", "image"], output: ["text"] })).toBeUndefined();
    expect(inferAuthoredModelType({ id: "openai/gpt-image-2", input: ["text", "image"], output: ["image"] })).toBe("image");
  });

  test("rejects unknown types and combining all with a type", () => {
    expect(() => parseModelTypes("unknown")).toThrow(InvalidModelTypeError);
    expect(() => parseModelTypes("all,decision")).toThrow(
      InvalidModelTypeError,
    );
  });

  test("omits decision models by default while keeping non-decision models", () => {
    const catalog = fixture();
    const filtered = filterCatalogByModelType(catalog, "default");

    expect(Object.keys(filtered.models)).toEqual(["standard", "image"]);
    expect(Object.keys(filtered.providers.example!.models)).toEqual([
      "standard",
      "image",
    ]);
    expect(filtered.providers.decisionOnly).toBeUndefined();
  });

  test("filters canonical and provider models by requested type", () => {
    const catalog = fixture();
    const filtered = filterCatalogByModelType(catalog, ["decision"]);

    expect(Object.keys(filtered.models)).toEqual(["decision"]);
    expect(Object.keys(filtered.providers.example!.models)).toEqual([
      "decision",
    ]);
    expect(Object.keys(filtered.providers.decisionOnly!.models)).toEqual([
      "decision",
    ]);
    expect(Object.keys(filterCatalogByModelType(catalog, ["image"]).models)).toEqual([
      "image",
    ]);
    expect(Object.keys(filterCatalogByModelType(catalog, ["chat"]).models)).toEqual([
      "standard",
    ]);
    expect(filterCatalogByModelType(catalog, "all")).toEqual(catalog);
  });

  test("Jev, Clef, and Liquid d1 are decision models omitted by default", async () => {
    const root = path.join(import.meta.dir, "..", "..", "..");
    const catalog = await generateCatalog(root);
    const jevModels = Object.values(catalog.providers).flatMap((provider) =>
      Object.values(provider.models).filter((model) =>
        model.id.toLowerCase().includes("jev"),
      ),
    );

    expect(jevModels.length).toBeGreaterThan(0);
    expect(jevModels.every((model) => model.type === "decision")).toBe(true);

    const defaults = filterCatalogByModelType(catalog, "default");
    expect(
      Object.values(defaults.providers).some((provider) =>
        Object.values(provider.models).some((model) => model.type !== undefined),
      ),
    ).toBe(false);
    expect(defaults.models["typesafe/jev-latest"]).toBeUndefined();
    expect(defaults.providers.vivgrid?.models.jev).toBeUndefined();

    const decisions = filterCatalogByModelType(catalog, ["decision"]);
    expect(decisions.models["typesafe/jev-latest"]?.type).toBe("decision");
    expect(decisions.models["liquid/d1"]?.type).toBe("decision");
    for (const id of ["@cf/cloudflare/clef", "@cf/cloudflare/clef-flash"]) {
      expect(catalog.providers["cloudflare-workers-ai"]?.models[id]?.type).toBe("decision");
      expect(defaults.providers["cloudflare-workers-ai"]?.models[id]).toBeUndefined();
      expect(decisions.providers["cloudflare-workers-ai"]?.models[id]?.type).toBe("decision");
    }
    expect(defaults.providers.vercel?.models["liquid/d1"]).toBeUndefined();
    expect(decisions.providers.vercel?.models["liquid/d1"]?.type).toBe("decision");
    const typedModels = Object.values(catalog.providers).flatMap((provider) =>
      Object.values(provider.models).filter((model) => model.type === "decision"),
    );
    expect(Object.values(decisions.providers).flatMap((provider) =>
      Object.values(provider.models),
    ).length).toBe(typedModels.length);
  });
});

function fixture() {
  const standard = model("standard-model");
  const image = model("image-model", "image");
  const decision = model("decision-model", "decision");
  return {
    models: { standard, image, decision },
    providers: {
      example: {
        id: "example",
        models: { standard, image, decision },
      } as unknown as Provider,
      decisionOnly: {
        id: "decision-only",
        models: { decision },
      } as unknown as Provider,
    },
  };
}

function model(id: string, type?: (typeof MODEL_TYPES)[number]) {
  return { id, type } as unknown as ModelMetadata;
}
