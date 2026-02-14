import {
	type CoreMessage,
	type CoreAssistantMessage,
	type CoreToolMessage,
	generateText,
} from "ai";
import type { AgentMessage, AgentAssistantMessage, AgentToolMessage, AgentLoopConfig } from "./types.js";

export interface CompactorOptions {
	/** Token threshold to trigger compaction. Default: 30000 */
	threshold?: number;
	/** Number of recent messages to always keep raw. Default: 10 */
	keepRecent?: number;
	/** Strategy: 'prune' (erase tool outputs) or 'summarize' (LLM summary) or 'hybrid' */
	strategy?: "prune" | "summarize" | "hybrid";
}

export class ContextCompactor {
	private threshold: number;
	private keepRecent: number;
	private strategy: "prune" | "summarize" | "hybrid";

	constructor(opts: CompactorOptions = {}) {
		this.threshold = opts.threshold ?? 30000;
		this.keepRecent = opts.keepRecent ?? 10;
		this.strategy = opts.strategy ?? "hybrid";
	}

	/**
	 * Main entry point for context transformation.
	 * Can be used directly as AgentLoopConfig.transformContext.
	 */
	async run(messages: AgentMessage[], config?: AgentLoopConfig): Promise<AgentMessage[]> {
		const totalTokens = this.estimateTokens(messages);
		if (totalTokens < this.threshold) {
			return messages;
		}

		let processed = messages;

		if (this.strategy === "prune" || this.strategy === "hybrid") {
			processed = this.pruneToolOutputs(processed);
		}

		if (this.strategy === "summarize" || (this.strategy === "hybrid" && this.estimateTokens(processed) > this.threshold)) {
			if (config?.model) {
				processed = await this.summarizeHistory(processed, config);
			}
		}

		return processed;
	}

	/**
	 * Erase results of older tool messages to save space while keeping the fact they were called.
	 */
	private pruneToolOutputs(messages: AgentMessage[]): AgentMessage[] {
		const boundary = messages.length - this.keepRecent;
		return messages.map((msg, idx) => {
			if (idx < boundary && msg.role === "tool") {
				return {
					...msg,
					content: msg.content.map((part) => ({
						...part,
						result: "(Output pruned to save context space)",
					})),
				} as AgentToolMessage;
			}
			return msg;
		});
	}

	/**
	 * Use the LLM to summarize the older portion of the history.
	 */
	private async summarizeHistory(messages: AgentMessage[], config: AgentLoopConfig): Promise<AgentMessage[]> {
		const boundary = Math.max(0, messages.length - this.keepRecent);
		const toSummarize = messages.slice(0, boundary);
		const toKeep = messages.slice(boundary);

		if (toSummarize.length === 0) return messages;

		const llmHistory = toSummarize.map(({ timestamp, usage, ...rest }) => rest as CoreMessage);

		try {
			const { text } = await generateText({
				model: config.model,
				system: "You are a context summarizer. Distill the following interaction into a concise summary of the current state, task progress, and important facts. Focus on what was achieved and what remains to be done. Keep it under 300 words.",
				messages: [
					...llmHistory,
					{ role: "user", content: "Summarize our interaction so far into a state snapshot." },
				],
			});

			return [
				{
					role: "user",
					content: `[Context Summary of prior turns]: ${text}`,
					timestamp: Date.now(),
				},
				...toKeep,
			];
		} catch (e) {
			console.error("Compaction summary failed:", e);
			return messages; // Fallback to raw history
		}
	}

	/**
	 * Heuristic token estimation (chars / 4).
	 */
	private estimateTokens(messages: AgentMessage[]): number {
		let chars = 0;
		for (const msg of messages) {
			if (typeof msg.content === "string") {
				chars += msg.content.length;
			} else if (Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (part.type === "text") chars += part.text.length;
					if (part.type === "tool-call") chars += JSON.stringify(part.args).length + 50;
					if (part.type === "tool-result") chars += JSON.stringify(part.result).length;
					if (part.type === "image") chars += 4800;
				}
			}
		}
		return Math.ceil(chars / 4);
	}
}
