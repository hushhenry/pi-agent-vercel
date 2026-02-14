import { type AgentMessage } from "../types.js";
import { type CompactionResult, type CompactionStrategy } from "./types.js";
import { PruneStrategy, type PruneOptions } from "./prune.js";
import { SummarizeStrategy, type SummarizeOptions } from "./summarize.js";
import { estimateTokens } from "./utils.js";

export interface CompactorOptions {
	/** Token threshold to trigger compaction. Default: 30000 */
	threshold?: number;
	/** Strategy to use: 'prune' | 'summarize' | 'hybrid'. Default: 'hybrid' */
	mode?: "prune" | "summarize" | "hybrid";
	/** Options for pruning */
	pruneOptions?: PruneOptions;
	/** Options for summarization */
	summarizeOptions?: SummarizeOptions;
}

/**
 * ContextCompactor
 * 
 * Orchestrates different compaction strategies to keep Agent context 
 * within manageable limits.
 */
export class ContextCompactor {
	private threshold: number;
	private mode: "prune" | "summarize" | "hybrid";
	private pruner: PruneStrategy;
	private summarizer: SummarizeStrategy;

	constructor(private options: CompactorOptions = {}) {
		this.threshold = options.threshold ?? 30000;
		this.mode = options.mode ?? "hybrid";
		this.pruner = new PruneStrategy();
		this.summarizer = new SummarizeStrategy();
	}

	async run(messages: AgentMessage[], runtimeOptions?: { model?: any }): Promise<AgentMessage[]> {
		const tokens = estimateTokens(messages);
		if (tokens < this.threshold) return messages;

		let result: CompactionResult = {
			messages,
			compactedCount: 0,
			tokensBefore: tokens,
			tokensAfter: tokens
		};

		// 1. Hybrid or Prune mode: Try pruning first (it's fast and non-destructive)
		if (this.mode === "prune" || this.mode === "hybrid") {
			result = await this.pruner.compact(result.messages, this.options.pruneOptions);
		}

		// 2. Hybrid or Summarize mode: If still over threshold, use LLM to summarize
		if (this.mode === "summarize" || (this.mode === "hybrid" && result.tokensAfter > this.threshold)) {
			const summarizeOpts = {
				...this.options.summarizeOptions,
				model: runtimeOptions?.model || this.options.summarizeOptions?.model
			};

			if (summarizeOpts.model) {
				result = await this.summarizer.compact(result.messages, summarizeOpts as SummarizeOptions);
			}
		}

		return result.messages;
	}
}

export * from "./types.js";
export * from "./utils.js";
export * from "./prune.js";
export * from "./summarize.js";
