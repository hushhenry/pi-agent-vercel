import { type CoreMessage } from "ai";
import { type AgentMessage } from "../types.js";

export interface CompactionResult {
	messages: AgentMessage[];
	compactedCount: number;
	tokensBefore: number;
	tokensAfter: number;
}

export interface CompactionStrategy {
	name: string;
	compact(messages: AgentMessage[], options: any): Promise<CompactionResult>;
}
