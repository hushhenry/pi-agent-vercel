import { type AgentMessage } from "../types.js";

/**
 * Heuristic token estimation (chars / 4).
 * Matches the logic found in both Pi and OpenCode for pre-request checks.
 */
export function estimateTokens(messages: AgentMessage[]): number {
	let chars = 0;
	for (const msg of messages) {
		if (typeof msg.content === "string") {
			chars += msg.content.length;
		} else if (Array.isArray(msg.content)) {
			for (const part of msg.content) {
				if (part.type === "text") chars += part.text.length;
				if (part.type === "tool-call") {
					chars += part.toolName.length + JSON.stringify(part.args).length + 50;
				}
				if (part.type === "tool-result") {
					chars += JSON.stringify(part.result).length;
				}
				if (part.type === "image") {
					chars += 4800; // Standard estimate for high-res images
				}
			}
		}
	}
	return Math.ceil(chars / 4);
}
