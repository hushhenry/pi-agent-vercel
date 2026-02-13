import {
	type LanguageModel,
	type CoreMessage,
	streamText,
} from "ai";
import {
	EventStream,
} from "@mariozechner/pi-ai"; // We'll replace this once we have a standalone EventStream
import type {
	AgentContext,
	AgentEvent,
	AgentLoopConfig,
	AgentMessage,
} from "./types.js";

/**
 * Simplified streamAssistantResponse using Vercel AI SDK
 */
async function streamAssistantResponse(
	context: AgentContext,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	stream: any, // EventStream<AgentEvent, AgentMessage[]>
): Promise<any> {
    const messages = await config.convertToLlm(context.messages);
    
    const result = await streamText({
        model: config.model,
        messages,
        system: context.systemPrompt,
        abortSignal: signal,
    });

    const assistantMessage: AgentMessage = {
        role: "assistant",
        content: [],
        timestamp: Date.now(),
    } as any;

    stream.push({ type: "message_start", message: assistantMessage });

    for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
            const lastPart = assistantMessage.content[assistantMessage.content.length - 1];
            if (lastPart?.type === 'text') {
                lastPart.text += part.textDelta;
            } else {
                assistantMessage.content.push({ type: 'text', text: part.textDelta });
            }
            stream.push({ type: "message_update", message: assistantMessage });
        }
        
        if (part.type === 'tool-call') {
            assistantMessage.content.push({
                type: 'toolCall',
                id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.parse(part.args),
            } as any);
            stream.push({ type: "message_update", message: assistantMessage });
        }
    }

    stream.push({ type: "message_end", message: assistantMessage });
    return assistantMessage;
}
