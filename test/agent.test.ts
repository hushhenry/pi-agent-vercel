import { describe, expect, it, vi } from "vitest";
import { Agent } from "../src/agent.js";
import { type LanguageModelV1 } from "ai";

const mockModel: LanguageModelV1 = {
  specificationVersion: 'v1',
  defaultObjectGenerationMode: undefined,
  modelId: 'mock-model',
  provider: 'mock-provider',
  doGenerate: vi.fn(),
  doStream: vi.fn().mockResolvedValue({
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-delta', textDelta: 'Hello' });
        controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 } });
        controller.close();
      }
    }),
    rawCall: { rawPrompt: [], rawSettings: {} }
  })
} as any;

describe("Agent", () => {
	it("should create an agent instance with default state", () => {
		const agent = new Agent({ model: mockModel as any });

		expect(agent).toBeDefined();
        // Check initial state via private members or public getters if available
	});

	it("should support steering message queue", async () => {
		const agent = new Agent({ model: mockModel as any });

		const message = { role: "user" as const, content: "Steering message", timestamp: Date.now() };
		agent.steer(message);
        // Queue check
	});

	it("should handle prompt loop", async () => {
		const agent = new Agent({ 
            model: mockModel as any,
            systemPrompt: "You are a bot"
        });

		const stream = await agent.prompt("Hello");
        const messages = await stream.result();
        
        expect(messages.length).toBe(2); // User + Assistant
        expect(messages[1].role).toBe("assistant");
        expect((messages[1] as any).content[0].text).toBe("Hello");
	});

	it("should handle abort controller", async () => {
		const agent = new Agent({ model: mockModel as any });
		expect(() => agent.abort()).not.toThrow();
	});
});
