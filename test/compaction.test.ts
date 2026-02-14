import { describe, it, expect, vi } from "vitest";
import { PruneStrategy } from "../src/compaction/prune.js";
import { SummarizeStrategy } from "../src/compaction/summarize.js";
import { ContextCompactor } from "../src/compaction/compactor.js";
import { estimateTokens } from "../src/compaction/utils.js";
import { AgentMessage } from "../src/types.js";

describe("Compaction Utils", () => {
	it("should estimate tokens based on characters", () => {
		const messages: AgentMessage[] = [
			{ role: "user", content: "Hello world", timestamp: Date.now() }
		];
		// "Hello world" is 11 chars. 11 / 4 = 2.75 -> 3 tokens
		expect(estimateTokens(messages)).toBe(3);
	});

	it("should handle array content in estimation", () => {
		const messages: AgentMessage[] = [
			{ 
				role: "assistant", 
				content: [{ type: "text", text: "Reasoning..." }],
				timestamp: Date.now()
			}
		];
		expect(estimateTokens(messages)).toBe(3);
	});
});

describe("PruneStrategy (OpenCode Style)", () => {
	it("should erase content of old tool messages", async () => {
		const strategy = new PruneStrategy();
		const messages: AgentMessage[] = [
			{ 
				role: "tool", 
				content: [{ type: "tool-result", toolCallId: "1", toolName: "cat", result: "A very long file content..." }],
				timestamp: Date.now() 
			},
			{ role: "user", content: "Next step", timestamp: Date.now() }
		];

		const result = await strategy.compact(messages, { keepRecent: 1 });
		
		expect(result.compactedCount).toBe(1);
		const prunedTool = result.messages[0] as any;
		expect(prunedTool.content[0].result).toBe("(result pruned)");
		expect(result.messages[1].role).toBe("user"); // Recent message kept
	});
});

describe("SummarizeStrategy (Pi Style)", () => {
	it("should call LLM to summarize history", async () => {
		const mockModel = {} as any;
		const strategy = new SummarizeStrategy();
		
		// Mock generateText
		vi.mock("ai", async () => {
			const actual = await vi.importActual("ai");
			return {
				...actual,
				generateText: vi.fn().mockResolvedValue({ text: "The user said hello." })
			};
		});

		const messages: AgentMessage[] = [
			{ role: "user", content: "Hello", timestamp: 100 },
			{ role: "assistant", content: [{ type: "text", text: "Hi" }], timestamp: 200 },
			{ role: "user", content: "Keep this", timestamp: 300 }
		];

		const result = await strategy.compact(messages, { 
			model: mockModel, 
			keepRecent: 1 
		});

		expect(result.messages.length).toBe(2);
		expect(result.messages[0].content).toContain("The user said hello.");
		expect(result.messages[1].content).toBe("Keep this");
	});
});

describe("ContextCompactor Orchestrator", () => {
	it("should not compact if under threshold", async () => {
		const compactor = new ContextCompactor({ threshold: 1000 });
		const messages: AgentMessage[] = [{ role: "user", content: "short", timestamp: 1 }];
		
		const processed = await compactor.run(messages);
		expect(processed).toEqual(messages);
	});

	it("should use hybrid mode by default", async () => {
		const compactor = new ContextCompactor({ 
			threshold: 1, 
			pruneOptions: { keepRecent: 1 } 
		}); // Force compaction
		const messages: AgentMessage[] = [
			{ 
				role: "tool", 
				content: [{ type: "tool-result", toolCallId: "1", toolName: "ls", result: "file.txt" }],
				timestamp: 1
			},
			{ role: "user", content: "recent", timestamp: 2 }
		];

		const processed = await compactor.run(messages);
		const toolMsg = processed[0] as any;
		expect(toolMsg.content[0].result).toBe("(result pruned)");
	});
});
