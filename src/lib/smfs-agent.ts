import Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent } from "./smfs-types";
import { userContainerTag } from "./supermemory";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

/** Maximum number of notes returned for a single Supermemory search. */
const SEARCH_RESULT_LIMIT = 5;

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

/** Narrow shape for the input field on the tools we know about. */
type AgentToolInput = { command?: string; query?: string };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function runAgent(params: {
  message: string;
  conversationHistory: Anthropic.MessageParam[];
  anthropicApiKey: string;
  supermemoryApiKey: string | null;
  /**
   * The Notty user ID whose notes the agent is allowed to search. Required for
   * search to be enabled — uploads and searches are scoped per-user via
   * Supermemory containerTags so users can never see each other's notes.
   */
  userId: string;
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
      const toolUseBlocks: Array<{ id: string; name: string; input: AgentToolInput }> = [];

      for (const block of response.content) {
        if (block.type === "text") {
          params.onEvent({ type: "text", content: block.text });
        } else if (block.type === "tool_use") {
          const input = block.input as AgentToolInput;
          params.onEvent({ type: "tool_use", id: block.id, name: block.name, input: input as Record<string, unknown> });
          toolUseBlocks.push({ id: block.id, name: block.name, input });
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
              result = await searchNotes(tool.input.query ?? "", params.supermemoryApiKey, params.userId);
            } else {
              result = await params.executeBash(tool.input.command ?? "");
            }
            params.onEvent({ type: "tool_result", tool_use_id: tool.id, name: tool.name, result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: result || "(no output)",
            });
          } catch (err: unknown) {
            const errorMsg = errMsg(err);
            params.onEvent({ type: "tool_result", tool_use_id: tool.id, name: tool.name, result: `Error: ${errorMsg}` });
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

        // Signal the client to flush this assistant+tool_result pair into
        // its raw history before the next loop iteration begins.  Without
        // this marker the client would merge all iterations' blocks into one
        // flat array, producing invalid non-alternating Anthropic history.
        params.onEvent({ type: "loop_turn" });
      }

      continueLoop = response.stop_reason === "tool_use";
    } catch (err: unknown) {
      params.onEvent({ type: "error", message: errMsg(err) });
      continueLoop = false;
      // Do not emit "done" after an error — the error event signals end-of-session
      return;
    }
  }

  params.onEvent({ type: "done" });
}

async function searchNotes(query: string, apiKey: string, userId: string): Promise<string> {
  // Always scope the search to this user's containerTag so results from other
  // users in the same Supermemory account never leak into responses.
  const res = await fetch("https://api.supermemory.ai/v3/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      limit: SEARCH_RESULT_LIMIT,
      containerTags: [userContainerTag(userId)],
    }),
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
