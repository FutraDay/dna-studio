import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm/client", () => ({ generateJSON: vi.fn(), streamText: vi.fn() }));

import { generateJSON, streamText } from "@/lib/llm/client";
import { generateCampaign, repairCampaign, streamCampaign } from "@/lib/campaigns/generator";
import { buildCampaignPrompt } from "@/lib/campaigns/prompt-builder";
import { makeBrandDNA } from "../../fixtures/brand-dna";

const json = vi.mocked(generateJSON);
const stream = vi.mocked(streamText);
const dna = makeBrandDNA();

describe("generateCampaign", () => {
  beforeEach(() => {
    json.mockResolvedValue({ concepts: [] } as never);
  });

  it("returns whatever the model produced", async () => {
    json.mockResolvedValue({ concepts: [{ name: "Launch" }] } as never);
    await expect(generateCampaign(dna, "goal", ["instagram"])).resolves.toEqual({
      concepts: [{ name: "Launch" }],
    });
  });

  it("sends the campaign prompt built from the brand", async () => {
    await generateCampaign(dna, "Launch cold brew", ["instagram", "linkedin"], "Arabic");

    const messages = json.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toBe(
      buildCampaignPrompt(dna, "Launch cold brew", ["instagram", "linkedin"], "Arabic")
    );
  });

  it("defaults to English", async () => {
    await generateCampaign(dna, "goal", ["instagram"]);

    const messages = json.mock.calls[0][0] as { content: string }[];
    expect(messages[1].content).toContain("LANGUAGE: English");
  });

  it("asks for JSON with room for a long response", async () => {
    await generateCampaign(dna, "goal", ["instagram"]);
    expect(json).toHaveBeenCalledWith(expect.anything(), {
      maxTokens: 8192,
      contextTokens: 8192,
      temperature: 0.8,
      json: true,
    });
  });
});

describe("streamCampaign", () => {
  it("passes the model's chunks straight through", async () => {
    stream.mockImplementation(async function* () {
      yield "{";
      yield '"concepts":[]}';
    } as never);

    const chunks = [];
    for await (const chunk of streamCampaign(dna, "goal", ["instagram"])) {
      chunks.push(chunk);
    }

    expect(chunks.join("")).toBe('{"concepts":[]}');
  });

  it("streams with the same options as the non-streaming path", async () => {
    stream.mockImplementation(async function* () {} as never);

    for await (const _ of streamCampaign(dna, "goal", ["instagram"])) {
      // drain
    }

    expect(stream).toHaveBeenCalledWith(expect.anything(), {
      maxTokens: 8192,
      contextTokens: 8192,
      temperature: 0.8,
      json: true,
    });
  });
});

describe("repairCampaign", () => {
  it("asks the model to fix deterministic quality failures", async () => {
    json.mockResolvedValue({ concepts: [] } as never);

    await repairCampaign(
      dna,
      "Launch cold brew",
      ["instagram", "linkedin"],
      "English",
      { concepts: [] },
      [
        { message: "Expected exactly 5 campaign concepts but received 2." },
        { message: "Concept 1 references unverified company XYZ Co." },
      ]
    );

    const messages = json.mock.calls.at(-1)?.[0] as { role: string; content: string }[];
    expect(messages[0].content).toContain("strict senior B2B content editor");
    expect(messages[1].content).toContain("QUALITY REPAIR TASK");
    expect(messages[1].content).toContain("Expected exactly 5 campaign concepts");
    expect(messages[1].content).toContain("XYZ Co.");
    expect(messages[1].content).toContain('"concepts": []');
  });

  it("uses strict style recovery instructions for editorial failures", async () => {
    json.mockResolvedValue({ concepts: [] } as never);

    await repairCampaign(dna, "goal", ["instagram", "linkedin"], "English", { concepts: [] }, [
      { code: "question_hook_overuse", message: "9 assets open with questions." },
      { code: "generic_cliche", message: 'Concept 5 uses generic marketing cliche "worried about".' },
    ]);

    const messages = json.mock.calls.at(-1)?.[0] as { role: string; content: string }[];
    expect(messages[1].content).toContain("STRICT STYLE RECOVERY MODE");
    expect(messages[1].content).toContain("ZERO question-style opening hooks");
    expect(messages[1].content).toContain("worried about");
    expect(messages[1].content).toContain("Every asset must have a distinct opening phrase");
    expect(json).toHaveBeenLastCalledWith(expect.anything(), {
      maxTokens: 8192,
      contextTokens: 8192,
      temperature: 0.1,
      json: true,
    });
  });

  it("uses a lower temperature for repair work", async () => {
    json.mockResolvedValue({ concepts: [] } as never);

    await repairCampaign(dna, "goal", ["instagram"], "English", { concepts: [] }, [
      { message: "fix it" },
    ]);

    expect(json).toHaveBeenLastCalledWith(expect.anything(), {
      maxTokens: 8192,
      contextTokens: 8192,
      temperature: 0.3,
      json: true,
    });
  });
});
