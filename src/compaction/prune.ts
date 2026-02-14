import { type AgentMessage, type AgentToolMessage } from "../types.js";
import { type CompactionResult, type CompactionStrategy } from "./types.js";
import { estimateTokens } from "./utils.js";

export interface PruneOptions {
	/** Number of recent messages to keep fully intact. Default: 10 */
	keepRecent?: number;
	/** Minimum token threshold to trigger pruning. Default: 20000 */
	minimumPruneTokens?: number;
}

/**
 * PruneStrategy (OpenCode style)
 * 
 * Instead of summarizing, it "erases" the results of old tool calls.
 * This keeps the conversation structure intact (LLM knows the tool was called)
 * but drastically reduces token count by removing large outputs (like file reads).
 */
export class PruneStrategy implements CompactionStrategy {
	name = "prune";

	async compact(messages: AgentMessage[], options: PruneOptions = {}): Promise<CompactionResult> {
		const keepRecent = options.keepRecent ?? 10;
		const tokensBefore = estimateTokens(messages);
		
		const boundary = Math.max(0, messages.length - keepRecent);
		let compactedCount = 0;

		const processed = messages.map((msg, idx) => {
			// Only prune tool messages that are outside the "recent" boundary
			if (idx < boundary && msg.role === "tool") {
				const toolMsg = msg as AgentToolMessage;
				const isAlreadyPruned = toolMsg.content.every(
					part => typeof part.result === "string" && part.result === "(result pruned)"
				);

				if (!isAlreadyPruned) {
					compactedCount++;
					return {
						...msg,
						content: toolMsg.content.map(part => ({
							...part,
							result: "(result pruned)"
						}))
					} as AgentToolMessage;
				}
			}
			return msg;
		});

		return {
			messages: processed,
			compactedCount,
			tokensBefore,
			tokensAfter: estimateTokens(processed)
		};
	}
}
