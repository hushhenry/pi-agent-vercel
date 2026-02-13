import {
	type LanguageModel,
	type CoreMessage,
} from "ai";
import { agentLoop, agentLoopContinue } from "./agent-loop.js";
import { EventStream } from "./utils/event-stream.js";
import type {
	AgentContext,
	AgentEvent,
	AgentLoopConfig,
	AgentMessage,
	AgentTool,
	ThinkingLevel,
} from "./types.js";

function defaultConvertToLlm(messages: AgentMessage[]): CoreMessage[] {
	return messages.map((m) => {
		if (m.role === "user") {
			return {
				role: "user",
				content: typeof m.content === "string" 
					? m.content 
					: m.content.map(c => {
						if (c.type === "text") return { type: "text", text: c.text };
						if (c.type === "image") return { type: "image", image: c.data, mimeType: c.mimeType };
						return { type: "text", text: "" };
					})
			} as CoreMessage;
		}
		if (m.role === "assistant") {
			return {
				role: "assistant",
				content: m.content.map(c => {
					if (c.type === "text") return { type: "text", text: c.text };
					if (c.type === "toolCall") return { type: "tool-call", toolCallId: c.id, toolName: c.name, args: c.arguments };
					return { type: "text", text: "" };
				})
			} as CoreMessage;
		}
		if (m.role === "toolResult") {
			return {
				role: "tool",
				content: m.content.map(c => {
					if (c.type === "text") return { type: "tool-result", toolCallId: m.toolCallId, toolName: m.toolName, result: c.text };
					return { type: "tool-result", toolCallId: m.toolCallId, toolName: m.toolName, result: "" };
				})
			} as CoreMessage;
		}
		return { role: "user", content: "" } as CoreMessage;
	});
}

export interface AgentOptions {
	model: LanguageModel;
	initialMessages?: AgentMessage[];
	systemPrompt?: string;
	convertToLlm?: (messages: AgentMessage[]) => CoreMessage[] | Promise<CoreMessage[]>;
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
}

export class Agent {
	private model: LanguageModel;
	private messages: AgentMessage[] = [];
	private systemPrompt: string = "";
	private convertToLlm: (messages: AgentMessage[]) => CoreMessage[] | Promise<CoreMessage[]>;
	private transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	private steeringQueue: AgentMessage[] = [];
	private followUpQueue: AgentMessage[] = [];
	private abortController?: AbortController;
	private isStreaming: boolean = false;
	private tools: AgentTool<any>[] = [];

	constructor(opts: AgentOptions) {
		this.model = opts.model;
		this.messages = opts.initialMessages || [];
		this.systemPrompt = opts.systemPrompt || "";
		this.convertToLlm = opts.convertToLlm || defaultConvertToLlm;
		this.transformContext = opts.transformContext;
	}

	setTools(t: AgentTool<any>[]) {
		this.tools = t;
	}

	steer(m: AgentMessage) {
		this.steeringQueue.push(m);
	}

	followUp(m: AgentMessage) {
		this.followUpQueue.push(m);
	}

	abort() {
		this.abortController?.abort();
	}

	async prompt(input: string | AgentMessage | AgentMessage[]): Promise<EventStream<AgentEvent, AgentMessage[]>> {
		if (this.isStreaming) throw new Error("Agent is already streaming");

		let msgs: AgentMessage[];
		if (Array.isArray(input)) {
			msgs = input;
		} else if (typeof input === "string") {
			msgs = [{ role: "user", content: input, timestamp: Date.now() }];
		} else {
			msgs = [input];
		}

		this.abortController = new AbortController();
		this.isStreaming = true;

		const context: AgentContext = {
			systemPrompt: this.systemPrompt,
			messages: this.messages,
			tools: this.tools,
		};

		const config: AgentLoopConfig = {
			model: this.model,
			convertToLlm: this.convertToLlm,
			transformContext: this.transformContext,
			getSteeringMessages: async () => {
				const s = this.steeringQueue;
				this.steeringQueue = [];
				return s;
			},
			getFollowUpMessages: async () => {
				const f = this.followUpQueue;
				this.followUpQueue = [];
				return f;
			}
		};

		const stream = agentLoop(msgs, context, config, this.abortController.signal);
		
		(async () => {
			try {
				const finalMessages = await stream.result();
				this.messages.push(...finalMessages);
			} finally {
				this.isStreaming = false;
			}
		})();

		return stream;
	}
}
