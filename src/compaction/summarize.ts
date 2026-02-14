import { generateText, type LanguageModel } from "ai";
import { type AgentMessage } from "../types.js";
import { type CompactionResult, type CompactionStrategy } from "./types.js";
import { estimateTokens } from "./utils.js";

export interface SummarizeOptions {
	/** The model to use for summarization. Required. */
	model: LanguageModel;
	/** Number of recent messages to keep raw. Default: 6 */
	keepRecent?: number;
	/** Custom system prompt for the summarizer. */
	systemPrompt?: string;
}

/**
 * SummarizeStrategy (Pi style)
 * 
 * Uses an LLM to condense the older portion of the conversation into a 
 * single "Context Summary" message. This preserves semantic meaning while
 * freeing up maximum context space.
 */
export class SummarizeStrategy implements CompactionStrategy {
	name = "summarize";

	async compact(messages: AgentMessage[], options: SummarizeOptions): Promise<CompactionResult> {
		if (!options.model) throw new Error("SummarizeStrategy requires a model");

		const keepRecent = options.keepRecent ?? 6;
		const tokensBefore = estimateTokens(messages);
		
		const boundary = Math.max(0, messages.length - keepRecent);
		const toSummarize = messages.slice(0, boundary);
		const toKeep = messages.slice(boundary);

		if (toSummarize.length === 0) {
			return { messages, compactedCount: 0, tokensBefore, tokensAfter: tokensBefore };
		}

		// Convert to clean CoreMessages for the summarizer LLM
		const history = toSummarize.map(({ timestamp, usage, ...rest }) => rest);

		const { text } = await generateText({
			model: options.model,
			system: options.systemPrompt ?? 
				"You are a context summarizer. Distill the following interaction into a concise summary of the current state, task progress, and important facts. Focus on what was achieved and what remains to be done. Keep it under 300 words.",
			messages: [
				...history as any,
				{ role: "user", content: "Please provide a concise state snapshot of our interaction so far." }
			],
		});

		const summaryMessage: AgentMessage = {
			role: "user",
			content: `[Context Summary of prior turns]:\n${text}`,
			timestamp: Date.now()
		};

		const processed = [summaryMessage, ...toKeep];

		return {
			messages: processed,
			compactedCount: toSummarize.length,
			tokensBefore,
			tokensAfter: estimateTokens(processed)
		};
	}
}
