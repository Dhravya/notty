import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { toast } from "sonner";

type AgentMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    toolCalls?: Array<{ name: string; input: Record<string, unknown>; result?: string }>;
};

type SmfsContextType = {
    sandboxReady: boolean;
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
    const [files, setFiles] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [agentLoading, setAgentLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
    const initializingRef = useRef(false);

    const initSandbox = useCallback(async () => {
        if (sandboxReady || initializingRef.current) return;
        initializingRef.current = true;
        try {
            const res = await fetch("/api/smfs/sandbox", { method: "POST", credentials: "include" });
            if (res.ok) {
                setSandboxReady(true);
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(`Failed to initialize sandbox: ${(data as any).error || "Unknown error"}`);
            }
        } catch (err: any) {
            toast.error(`Sandbox error: ${err.message}`);
        } finally {
            initializingRef.current = false;
        }
    }, [sandboxReady]);

    const refreshFiles = useCallback(async () => {
        setLoading(true);
        try {
            // Recursively fetch all files
            const allPaths: string[] = [];
            const fetchDir = async (dirPath: string) => {
                const res = await fetch(`/api/smfs/files?path=${encodeURIComponent(dirPath)}`, { credentials: "include" });
                if (!res.ok) return;
                const data = await res.json() as { files: Array<{ name: string; path: string; type: string }> };
                for (const f of data.files) {
                    // Skip hidden files/dirs
                    if (f.name.startsWith(".")) continue;
                    const fullPath = f.path.startsWith("/") ? f.path : `${dirPath}/${f.name}`.replace(/\/\//g, "/");
                    if (f.type === "directory") {
                        allPaths.push(fullPath + "/");
                        // Only recurse one level deep to avoid too many requests
                        // The tree component handles expansion
                    } else {
                        allPaths.push(fullPath);
                    }
                }
            };
            await fetchDir("/home/user");
            setFiles(allPaths.map(p => p.replace(/^\/home\/user\/?/, "") || "/").filter(p => p !== "/"));
        } catch (err: any) {
            toast.error(`Failed to list files: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    const readFile = useCallback(async (path: string): Promise<string> => {
        const fullPath = path.startsWith("/") ? path : `/home/user/${path}`;
        const res = await fetch(`/api/smfs/file?path=${encodeURIComponent(fullPath)}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to read file");
        const data = await res.json() as { content: string };
        return data.content;
    }, []);

    const writeFile = useCallback(async (path: string, content: string) => {
        const fullPath = path.startsWith("/") ? path : `/home/user/${path}`;
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
        const fullPath = path.startsWith("/") ? path : `/home/user/${path}`;
        const res = await fetch(`/api/smfs/file?path=${encodeURIComponent(fullPath)}`, {
            method: "DELETE",
            credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete file");
        await refreshFiles();
    }, [refreshFiles]);

    const createFolder = useCallback(async (path: string) => {
        const fullPath = path.startsWith("/") ? path : `/home/user/${path}`;
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
        } catch (err: any) {
            toast.error(`Sync error: ${err.message}`);
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
        setMessages(prev => [...prev, userMsg]);
        setAgentLoading(true);

        try {
            // Build conversation history from existing messages
            const history = messages.map(m => ({
                role: m.role as "user" | "assistant",
                content: m.content,
            }));

            const res = await fetch("/api/smfs/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ message, conversationHistory: history }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: "Unknown error" }));
                toast.error(`Agent error: ${(err as any).error}`);
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
                            setMessages(prev => {
                                const existing = prev.find(m => m.id === assistantMsgId);
                                if (existing) {
                                    return prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantContent, toolCalls: [...toolCalls] } : m);
                                }
                                return [...prev, { id: assistantMsgId, role: "assistant" as const, content: assistantContent, toolCalls: [...toolCalls] }];
                            });
                        } else if (event.type === "tool_use") {
                            toolCalls.push({ name: event.name, input: event.input });
                            setMessages(prev => {
                                const existing = prev.find(m => m.id === assistantMsgId);
                                if (existing) {
                                    return prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantContent, toolCalls: [...toolCalls] } : m);
                                }
                                return [...prev, { id: assistantMsgId, role: "assistant" as const, content: assistantContent, toolCalls: [...toolCalls] }];
                            });
                        } else if (event.type === "tool_result") {
                            const lastTool = toolCalls[toolCalls.length - 1];
                            if (lastTool) lastTool.result = event.result;
                            setMessages(prev =>
                                prev.map(m => m.id === assistantMsgId ? { ...m, toolCalls: [...toolCalls] } : m)
                            );
                        } else if (event.type === "done") {
                            // Refresh files after agent is done (it may have modified the filesystem)
                            refreshFiles();
                        } else if (event.type === "error") {
                            toast.error(`Agent error: ${event.message}`);
                        }
                    } catch {}
                }
            }
        } catch (err: any) {
            toast.error(`Agent error: ${err.message}`);
        } finally {
            setAgentLoading(false);
        }
    }, [messages, refreshFiles]);

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
            sandboxReady, initSandbox,
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
