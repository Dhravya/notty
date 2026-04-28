import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { toast } from "sonner";

/** All sandbox paths live under this user home. */
const SANDBOX_HOME = "/home/user";
/** Maximum directory depth refreshFiles will traverse. */
const MAX_TREE_DEPTH = 3;

/**
 * Ensure a relative path is prefixed with the sandbox home. Inputs starting
 * with `/` are assumed to already be absolute sandbox paths and are returned
 * as-is — this means an absolute path outside `/home/user` will silently pass
 * through. The server-side `isSafeSandboxPath` check is the source of truth
 * for rejecting paths that escape the sandbox.
 */
function toFullPath(path: string): string {
    return path.startsWith("/") ? path : `${SANDBOX_HOME}/${path}`;
}

/** Join a parent directory and a child name, collapsing any `//`. */
function joinPath(parent: string, name: string): string {
    return `${parent}/${name}`.replace(/\/{2,}/g, "/");
}

/** Strip the sandbox home prefix to make a path display-friendly for the tree. */
function stripUserHome(path: string): string {
    return path.replace(new RegExp(`^${SANDBOX_HOME}/?`), "");
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

type AgentMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    toolCalls?: Array<{ name: string; input: Record<string, unknown>; result?: string }>;
};

type SmfsContextType = {
    sandboxReady: boolean;
    sandboxInitFailed: boolean;
    initSandbox: () => Promise<void>;
    files: string[];
    loading: boolean;
    refreshFiles: () => Promise<void>;
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    deleteFile: (path: string) => Promise<void>;
    createFolder: (path: string) => Promise<void>;
    syncNotes: () => Promise<void>;
    syncing: boolean;
    messages: AgentMessage[];
    sendMessage: (message: string) => Promise<void>;
    agentLoading: boolean;
    isOpen: boolean;
    togglePanel: () => void;
    selectedFile: string | null;
    selectedFileContent: string | null;
    selectFile: (path: string | null) => void;
};

const SmfsContext = createContext<SmfsContextType | null>(null);

export function useSmfs() {
    const ctx = useContext(SmfsContext);
    if (!ctx) throw new Error("useSmfs must be used within SmfsProvider");
    return ctx;
}

export function SmfsProvider({ children }: { children: ReactNode }) {
    const [sandboxReady, setSandboxReady] = useState(false);
    const [sandboxInitFailed, setSandboxInitFailed] = useState(false);
    const [files, setFiles] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [agentLoading, setAgentLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
    const initializingRef = useRef(false);

    // Mirror of `messages` for use inside callbacks that should not be
    // re-created on every message update (e.g. sendMessage). Reading from
    // this ref keeps sendMessage stable across renders so consumers can use
    // it as a stable dep without churn.
    const messagesRef = useRef<AgentMessage[]>([]);

    /**
     * Raw Anthropic message history for multi-turn conversations.
     *
     * The Anthropic API requires that when an assistant turn involved tool
     * use, the history must preserve the full content-block arrays
     * (tool_use + tool_result pairs). The UI-friendly `AgentMessage` type
     * only stores text + toolCalls separately, so we cannot reconstruct the
     * proper Anthropic format from it after the fact.
     *
     * This ref stores the history in the exact format the Anthropic API
     * expects, built incrementally as each SSE event arrives. It is reset
     * at the start of a new sendMessage call and grown throughout the turn.
     */
    const rawHistoryRef = useRef<Array<{ role: "user" | "assistant"; content: unknown }>>([]);
    const updateMessages = useCallback((updater: (prev: AgentMessage[]) => AgentMessage[]) => {
        setMessages(prev => {
            const next = updater(prev);
            messagesRef.current = next;
            return next;
        });
    }, []);

    const initSandbox = useCallback(async () => {
        if (sandboxReady || initializingRef.current) return;
        initializingRef.current = true;
        setSandboxInitFailed(false);
        try {
            const res = await fetch("/api/smfs/sandbox", { method: "POST", credentials: "include" });
            if (res.ok) {
                setSandboxReady(true);
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(`Failed to initialize sandbox: ${(data as { error?: string }).error || "Unknown error"}`);
                setSandboxInitFailed(true);
            }
        } catch (err: unknown) {
            toast.error(`Sandbox error: ${errMsg(err)}`);
            setSandboxInitFailed(true);
        } finally {
            initializingRef.current = false;
        }
    }, [sandboxReady]);

    const refreshFiles = useCallback(async () => {
        setLoading(true);
        try {
            const allPaths: string[] = [];
            const fetchDir = async (dirPath: string, depth: number) => {
                if (depth > MAX_TREE_DEPTH) return;
                const res = await fetch(`/api/smfs/files?path=${encodeURIComponent(dirPath)}`, { credentials: "include" });
                if (!res.ok) return;
                const data = await res.json() as { files: Array<{ name: string; path: string; type: string }> };
                const subdirs: string[] = [];
                for (const f of data.files) {
                    if (f.name.startsWith(".")) continue;
                    const fullPath = f.path.startsWith("/") ? f.path : joinPath(dirPath, f.name);
                    if (f.type === "directory") {
                        allPaths.push(fullPath + "/");
                        subdirs.push(fullPath);
                    } else {
                        allPaths.push(fullPath);
                    }
                }
                // Recurse into subdirectories in parallel
                await Promise.all(subdirs.map(d => fetchDir(d, depth + 1)));
            };
            await fetchDir(SANDBOX_HOME, 0);
            setFiles(allPaths.map(p => stripUserHome(p) || "/").filter(p => p !== "/"));
        } catch (err: unknown) {
            toast.error(`Failed to list files: ${errMsg(err)}`);
        } finally {
            setLoading(false);
        }
    }, []);

    const readFile = useCallback(async (path: string): Promise<string> => {
        const fullPath = toFullPath(path);
        const res = await fetch(`/api/smfs/file?path=${encodeURIComponent(fullPath)}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to read file");
        const data = await res.json() as { content: string };
        return data.content;
    }, []);

    const writeFile = useCallback(async (path: string, content: string) => {
        const fullPath = toFullPath(path);
        const res = await fetch("/api/smfs/file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ path: fullPath, content }),
        });
        if (!res.ok) throw new Error("Failed to write file");
        await refreshFiles();
    }, [refreshFiles]);

    const deleteFile = useCallback(async (path: string) => {
        const fullPath = toFullPath(path);
        const res = await fetch(`/api/smfs/file?path=${encodeURIComponent(fullPath)}`, {
            method: "DELETE",
            credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete file");
        await refreshFiles();
    }, [refreshFiles]);

    const createFolder = useCallback(async (path: string) => {
        const fullPath = toFullPath(path);
        const res = await fetch("/api/smfs/folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ path: fullPath }),
        });
        if (!res.ok) throw new Error("Failed to create folder");
        await refreshFiles();
    }, [refreshFiles]);

    const syncNotes = useCallback(async () => {
        setSyncing(true);
        try {
            const res = await fetch("/api/smfs/sync", { method: "POST", credentials: "include" });
            if (res.ok) {
                const data = await res.json() as { synced: number; errors: number; total: number };
                toast.success(`Synced ${data.synced}/${data.total} notes to Supermemory`);
            } else {
                toast.error("Failed to sync notes");
            }
        } catch (err: unknown) {
            toast.error(`Sync error: ${errMsg(err)}`);
        } finally {
            setSyncing(false);
        }
    }, []);

    const sendMessage = useCallback(async (message: string) => {
        const userMsg: AgentMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: message,
        };
        updateMessages(prev => [...prev, userMsg]);
        setAgentLoading(true);

        try {
            // Use the raw Anthropic-format history accumulated from previous
            // turns. This preserves tool_use/tool_result content blocks that
            // would be lost if we reconstructed history from the UI model.
            const history = rawHistoryRef.current;

            const res = await fetch("/api/smfs/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ message, conversationHistory: history }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: "Unknown error" }));
                toast.error(`Agent error: ${(err as { error?: string }).error}`);
                setAgentLoading(false);
                return;
            }

            const reader = res.body?.getReader();
            if (!reader) {
                setAgentLoading(false);
                return;
            }

            const decoder = new TextDecoder();
            let buffer = "";
            let assistantContent = "";
            const toolCalls: Array<{ name: string; input: Record<string, unknown>; result?: string }> = [];

            const assistantMsgId = crypto.randomUUID();

            // ── Raw history tracking ─────────────────────────────────────────
            // The Anthropic API requires strictly alternating user/assistant
            // pairs, and assistant turns that used tools MUST have their full
            // content-block array (including tool_use blocks).  We cannot
            // reconstruct that from the UI-friendly AgentMessage model, so we
            // maintain a parallel raw accumulator here.
            //
            // The server may iterate through multiple while-loop turns within
            // a single agent call (tool_use → result → tool_use → result → …).
            // The server emits a `loop_turn` event after completing all
            // tool_results for one iteration, signalling us to flush the
            // current iteration's blocks into rawHistoryRef BEFORE starting
            // fresh accumulation for the next iteration.
            //
            // Only append the user message to rawHistoryRef AFTER confirming
            // res.ok to avoid leaving orphaned user messages with no assistant
            // response (which would produce invalid "two consecutive user
            // messages" history on the next sendMessage call).
            rawHistoryRef.current = [...rawHistoryRef.current, { role: "user", content: message }];

            // Per-iteration accumulators (reset on each loop_turn event).
            let iterAssistantBlocks: Array<
                | { type: "text"; text: string }
                | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
            > = [];
            let iterToolResults: Array<{
                type: "tool_result";
                tool_use_id: string;
                content: string;
            }> = [];

            /**
             * Flush the current iteration's assistant blocks + tool results
             * into rawHistoryRef, then reset the per-iteration accumulators.
             * Called on every `loop_turn` event from the server.
             */
            const flushIteration = () => {
                if (iterAssistantBlocks.length > 0) {
                    rawHistoryRef.current = [
                        ...rawHistoryRef.current,
                        { role: "assistant", content: [...iterAssistantBlocks] },
                    ];
                    if (iterToolResults.length > 0) {
                        rawHistoryRef.current = [
                            ...rawHistoryRef.current,
                            { role: "user", content: [...iterToolResults] },
                        ];
                    }
                }
                // Reset for next iteration.
                iterAssistantBlocks = [];
                iterToolResults = [];
            };

            // Single helper for the "find existing assistant message, update
            // or append" pattern shared by `text` and `tool_use` events.
            const upsertAssistant = (content: string, calls: typeof toolCalls) => {
                const snapshot = [...calls];
                updateMessages(prev => {
                    if (prev.some(m => m.id === assistantMsgId)) {
                        return prev.map(m =>
                            m.id === assistantMsgId
                                ? { ...m, content, toolCalls: snapshot }
                                : m
                        );
                    }
                    return [
                        ...prev,
                        { id: assistantMsgId, role: "assistant" as const, content, toolCalls: snapshot },
                    ];
                });
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                        const event = JSON.parse(line.slice(6));
                        if (event.type === "text") {
                            assistantContent += event.content;
                            // Accumulate or update the raw text block for this iteration.
                            const existingText = iterAssistantBlocks.find(b => b.type === "text");
                            if (existingText && existingText.type === "text") {
                                existingText.text = assistantContent;
                            } else {
                                iterAssistantBlocks.push({ type: "text", text: assistantContent });
                            }
                            upsertAssistant(assistantContent, toolCalls);
                        } else if (event.type === "tool_use") {
                            toolCalls.push({ name: event.name, input: event.input });
                            // Track raw tool_use block (with Anthropic-assigned id) for this iteration.
                            iterAssistantBlocks.push({
                                type: "tool_use",
                                id: event.id,
                                name: event.name,
                                input: event.input,
                            });
                            upsertAssistant(assistantContent, toolCalls);
                        } else if (event.type === "tool_result") {
                            const lastTool = toolCalls[toolCalls.length - 1];
                            if (lastTool) lastTool.result = event.result;
                            const snapshot = [...toolCalls];
                            updateMessages(prev =>
                                prev.map(m => m.id === assistantMsgId ? { ...m, toolCalls: snapshot } : m)
                            );
                            // Track raw tool_result for this iteration.
                            iterToolResults.push({
                                type: "tool_result",
                                tool_use_id: event.tool_use_id,
                                content: event.result,
                            });
                        } else if (event.type === "loop_turn") {
                            // Server has finished one while-loop iteration (all tool_results
                            // collected). Flush this iteration's blocks into rawHistoryRef as
                            // a proper assistant/user pair before the next iteration starts.
                            flushIteration();
                        } else if (event.type === "done") {
                            // Flush any final assistant content (text-only last turn or a
                            // final turn that had tool_use blocks not yet flushed — the
                            // server only emits loop_turn between iterations, not after the
                            // last one, so we must flush here too).
                            if (iterAssistantBlocks.length > 0) {
                                flushIteration();
                            } else if (assistantContent && rawHistoryRef.current[rawHistoryRef.current.length - 1]?.role !== "assistant") {
                                // Text-only final turn with no preceding loop_turn flushes.
                                rawHistoryRef.current = [
                                    ...rawHistoryRef.current,
                                    { role: "assistant", content: assistantContent },
                                ];
                            }
                            // Refresh files after agent is done (it may have modified the filesystem)
                            refreshFiles();
                        } else if (event.type === "error") {
                            toast.error(`Agent error: ${event.message}`);
                        }
                    } catch {}
                }
            }
        } catch (err: unknown) {
            toast.error(`Agent error: ${errMsg(err)}`);
        } finally {
            setAgentLoading(false);
        }
    }, [updateMessages, refreshFiles]);

    const selectFile = useCallback(async (path: string | null) => {
        setSelectedFile(path);
        if (path) {
            try {
                const content = await readFile(path);
                setSelectedFileContent(content);
            } catch {
                setSelectedFileContent(null);
            }
        } else {
            setSelectedFileContent(null);
        }
    }, [readFile]);

    const togglePanel = useCallback(() => {
        setIsOpen(prev => !prev);
    }, []);

    return (
        <SmfsContext.Provider value={{
            sandboxReady, sandboxInitFailed, initSandbox,
            files, loading, refreshFiles,
            readFile, writeFile, deleteFile, createFolder,
            syncNotes, syncing,
            messages, sendMessage, agentLoading,
            isOpen, togglePanel,
            selectedFile, selectedFileContent, selectFile,
        }}>
            {children}
        </SmfsContext.Provider>
    );
}
