import Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent } from "./smfs-types";

const SYSTEM_PROMPT = `You are an AI assistant integrated into Notty, a note-taking app. You have access to the user's virtual filesystem through a bash tool. You can run any shell command — ls, cat, mkdir, touch, rm, grep, find, echo, etc. The user's notes from Notty have been synced to Supermemory for semantic search. Help the user organize files, find information, and manage their workspace. Be concise and helpful.`;

const BASH_TOOL: Anthropic.Tool = {
  name: "bash",
  description: "Run a bash command in the user's virtual filesystem sandbox. Use this for all file operations: ls, cat, mkdir, touch, rm, grep, find, echo, etc.",
  input_schema: {
    type: "object" as const,
    properties: {
      command: { type: "string", description: "The bash command to execute" }
    },
    required: ["command"]
  }
};

export async function runAgent(params: {
  message: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: any }>;
  anthropicApiKey: string;
  executeBash: (command: string) => Promise<string>;
  onEvent: (event: AgentEvent) => void;
}): Promise<void> {
  const client = new Anthropic({ apiKey: params.anthropicApiKey });
  const messages: Anthropic.MessageParam[] = [
    ...params.conversationHistory,
    { role: "user", content: params.message }
  ];

  let continueLoop = true;
  while (continueLoop) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [BASH_TOOL],
        messages,
      });

      // Collect tool_use blocks for appending to messages
      const toolUseBlocks: Array<{ id: string; name: string; input: any }> = [];

      for (const block of response.content) {
        if (block.type === "text") {
          params.onEvent({ type: "text", content: block.text });
        } else if (block.type === "tool_use") {
          params.onEvent({ type: "tool_use", name: block.name, input: block.input as Record<string, unknown> });
          toolUseBlocks.push({ id: block.id, name: block.name, input: block.input });
        }
      }

      // If there were tool uses, execute them and add results
      if (toolUseBlocks.length > 0) {
        // Add the assistant's response to messages
        messages.push({ role: "assistant", content: response.content });

        // Execute each tool and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const tool of toolUseBlocks) {
          try {
            const result = await params.executeBash((tool.input as { command: string }).command);
            params.onEvent({ type: "tool_result", name: tool.name, result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: result || "(no output)",
            });
          } catch (err: any) {
            const errorMsg = err?.message || String(err);
            params.onEvent({ type: "tool_result", name: tool.name, result: `Error: ${errorMsg}` });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: `Error: ${errorMsg}`,
              is_error: true,
            });
          }
        }

        // Add tool results as a user message
        messages.push({ role: "user", content: toolResults });
      }

      continueLoop = response.stop_reason === "tool_use";
    } catch (err: any) {
      params.onEvent({ type: "error", message: err?.message || String(err) });
      continueLoop = false;
    }
  }

  params.onEvent({ type: "done" });
}
