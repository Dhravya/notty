import Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent } from "./smfs-types";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You are an AI assistant integrated into Notty, a note-taking app. You have access to the user's virtual filesystem through a bash tool. You can run any shell command — ls, cat, mkdir, touch, rm, grep, find, echo, etc. The user's notes from Notty have been synced to Supermemory for semantic search. Use the search_notes tool to find information from the user's notes when they ask about their note content. Help the user organize files, find information, and manage their workspace. Be concise and helpful.`;

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

const SEARCH_NOTES_TOOL: Anthropic.Tool = {
  name: "search_notes",
  description: "Semantically search the user's synced Notty notes. Use this when the user asks about their notes, wants to find something they wrote, or needs to recall information from their note-taking history.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "The search query to find relevant notes" }
    },
    required: ["query"]
  }
};

export async function runAgent(params: {
  message: string;
  conversationHistory: Anthropic.MessageParam[];
  anthropicApiKey: string;
  supermemoryApiKey: string | null;
  executeBash: (command: string) => Promise<string>;
  onEvent: (event: AgentEvent) => void;
}): Promise<void> {
  const client = new Anthropic({ apiKey: params.anthropicApiKey });
  const messages: Anthropic.MessageParam[] = [
    ...params.conversationHistory,
    { role: "user", content: params.message }
  ];

  const tools: Anthropic.Tool[] = [BASH_TOOL];
  if (params.supermemoryApiKey) {
    tools.push(SEARCH_NOTES_TOOL);
  }

  let continueLoop = true;
  while (continueLoop) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      // Collect tool_use blocks for appending to messages
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      for (const block of response.content) {
        if (block.type === "text") {
          params.onEvent({ type: "text", content: block.text });
        } else if (block.type === "tool_use") {
          params.onEvent({ type: "tool_use", name: block.name, input: block.input as Record<string, unknown> });
          toolUseBlocks.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
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
            let result: string;
            if (tool.name === "search_notes" && params.supermemoryApiKey) {
              result = await searchNotes(tool.input.query as string, params.supermemoryApiKey);
            } else {
              result = await params.executeBash(tool.input.command as string);
            }
            params.onEvent({ type: "tool_result", name: tool.name, result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: result || "(no output)",
            });
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
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
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      params.onEvent({ type: "error", message: errorMsg });
      continueLoop = false;
      // Do not emit "done" after an error — the error event signals end-of-session
      return;
    }
  }

  params.onEvent({ type: "done" });
}

async function searchNotes(query: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.supermemory.ai/v3/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, limit: 5 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return `Search failed (HTTP ${res.status}): ${text}`;
  }
  const data = await res.json() as { results?: Array<{ content?: string; metadata?: Record<string, unknown> }> };
  if (!data.results || data.results.length === 0) {
    return "No matching notes found.";
  }
  return data.results
    .map((r, i) => {
      const title = (r.metadata?.title as string | undefined) || "Untitled";
      return `[${i + 1}] ${title}\n${r.content || ""}`;
    })
    .join("\n\n---\n\n");
}
