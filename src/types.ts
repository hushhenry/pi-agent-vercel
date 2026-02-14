import {
	type LanguageModel,
	type CoreMessage,
	type CoreUserMessage,
	type CoreAssistantMessage,
	type CoreToolMessage,
	type Tool as VercelTool,
} from "ai";
import type { Static, TSchema } from "@sinclair/typebox";
import { EventStream } from "./utils/event-stream.js";

export type { LanguageModel, CoreMessage };

/**
 * Metadata added to standard Vercel AI SDK messages for session tracking.
 */
export interface MessageMeta {
	timestamp: number;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

export type AgentUserMessage = CoreUserMessage & MessageMeta;
export type AgentAssistantMessage = CoreAssistantMessage & MessageMeta;
export type AgentToolMessage = CoreToolMessage & MessageMeta;

export type AgentMessage = AgentUserMessage | AgentAssistantMessage | AgentToolMessage;

/**
 * AgentTool extends Vercel AI SDK's Tool type to add agent-specific 
 * capabilities like streaming updates and cancellation.
 */
export interface AgentTool<TParameters = any, TResult = any> extends VercelTool<TParameters, TResult> {
	/** Tool name (identifier) */
	name: string;
	/** Optional display label for UI */
	label?: string;
	/** 
	 * Enhanced execute function for agentic workflows.
	 * Overrides the base Vercel Tool execute with extra context.
	 */
	execute?: (
		args: TParameters,
		context: {
			toolCallId: string;
			signal?: AbortSignal;
			onUpdate?: (partialResult: any) => void;
		}
	) => Promise<TResult>;
}

export interface AgentContext {
	systemPrompt: string;
	messages: AgentMessage[];
	tools?: AgentTool<any>[];
}

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AgentLoopConfig {
	model: LanguageModel;
	reasoning?: ThinkingLevel;
	/** Now optional as messages are already CoreMessage compatible */
	convertToLlm?: (messages: AgentMessage[]) => CoreMessage[] | Promise<CoreMessage[]>;
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	getSteeringMessages?: () => Promise<AgentMessage[]>;
	getFollowUpMessages?: () => Promise<AgentMessage[]>;
}

export type AgentEvent =
	| { type: "agent_start" }
	| { type: "agent_end"; messages: AgentMessage[] }
	| { type: "turn_start" }
	| { type: "turn_end"; message: AgentAssistantMessage; toolResults: AgentToolMessage[] }
	| { type: "message_start"; message: AgentMessage }
	| { type: "message_update"; message: AgentMessage }
	| { type: "message_end"; message: AgentMessage }
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
	| { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
	| { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
