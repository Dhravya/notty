import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
    EditorRoot,
    EditorContent,
    EditorCommand,
    EditorCommandList,
    EditorCommandItem,
    EditorCommandEmpty,
    EditorBubble,
    EditorBubbleItem,
    type JSONContent,
    type EditorInstance,
    handleCommandNavigation,
} from "novel";
import { useDebouncedCallback } from "use-debounce";
import {
    BoldIcon,
    ItalicIcon,
    UnderlineIcon,
    StrikethroughIcon,
    CodeIcon,
} from "lucide-react";
import { SaveIndicator } from "./sync-status";
import * as Y from "yjs";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import type { Awareness } from "y-protocols/awareness";
import { NottyProvider } from "@/lib/yjs-provider";
import { useNotes } from "@/context/notes-context";
import { useAdapter } from "@/context/adapter-context";
import { useAuth } from "@/context/auth-context";
import { extensions as baseExtensions, suggestionItems } from "./editor-extensions";
import { hashStr } from "./note-card";

type Collaborator = { name: string; color: string; id: string };

function useCollaborators(awareness: Awareness, localClientId: number) {
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
    useEffect(() => {
        const update = () => {
            const others: Collaborator[] = [];
            awareness.getStates().forEach((state, clientId) => {
                if (clientId !== localClientId && state.user) {
                    others.push(state.user as Collaborator);
                }
            });
            setCollaborators(others);
        };
        awareness.on("change", update);
        update();
        return () => awareness.off("change", update);
    }, [awareness, localClientId]);
    return collaborators;
}

function dicebearUrl(seed: string) {
    return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}`;
}

const CURSOR_COLORS = [
    "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899",
    "#06B6D4", "#10B981", "#F97316", "#6366F1",
    "#14B8A6", "#E11D48", "#7C3AED", "#0EA5E9",
];

function extractTitle(json: JSONContent): string {
    const first = json.content?.[0];
    if (!first) return "Untitled";
    const text = first.content?.map((n: any) => n.text || "").join("") || "";
    return text.trim() || "Untitled";
}

type FontChoice = "sans" | "serif" | "mono";

const FONT_LABELS: Record<FontChoice, string> = { sans: "Sans", serif: "Serif", mono: "Mono" };
const FONT_STYLES: Record<FontChoice, React.CSSProperties> = {
    sans: {},
    serif: { fontFamily: "var(--font-serif)" },
    mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
};

export function Editor({ noteId, shareToken, readOnly = false, folderId, saveGuardRef, compact = false }: { noteId: string; shareToken?: string; readOnly?: boolean; folderId?: string | null; saveGuardRef?: React.MutableRefObject<boolean>; compact?: boolean }) {
    const { saveNote } = useNotes();
    const adapter = useAdapter();
    const { user } = useAuth();
    const [ready, setReady] = useState(false);
    const editorRef = useRef<EditorInstance | null>(null);
    const lastSavedRef = useRef<string>("");
    // Stable ref for folderId — prevents stale closures during unmount/view-transitions
    const folderIdRef = useRef(folderId);
    folderIdRef.current = folderId;
    const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
    const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [wordCount, setWordCount] = useState(0);
    const [charCount, setCharCount] = useState(0);

    const updateCounts = (editor: EditorInstance) => {
        const text = editor.getText();
        setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
        setCharCount(text.length);
    };

    const [showLines, setShowLines] = useState<boolean>(() => {
        try { return localStorage.getItem("notty-show-lines") !== "false"; }
        catch { return true; }
    });

    const toggleLines = () => {
        const next = !showLines;
        setShowLines(next);
        try { localStorage.setItem("notty-show-lines", String(next)); } catch {}
    };

    const [font, setFont] = useState<FontChoice>(() => {
        try { return (localStorage.getItem(`notty-font-${noteId}`) as FontChoice) || "sans"; }
        catch { return "sans"; }
    });

    const cycleFont = () => {
        const next: FontChoice = font === "sans" ? "serif" : font === "serif" ? "mono" : "sans";
        setFont(next);
        try { localStorage.setItem(`notty-font-${noteId}`, next); } catch {};
    };

    const ydoc = useMemo(() => new Y.Doc(), [noteId]);
    const provider = useMemo(
        () => adapter.createProvider(noteId, ydoc, { shareToken }),
        [noteId, ydoc, adapter, shareToken]
    );

    // --- DATA SAFETY: Aggressive, redundant saving ---

    // Save the title + content JSON to the server (for notes list, search, etc.)
    // For shared notes, Yjs WebSocket is the source of truth — skip HTTP saves
    // Don't create empty untitled notes — only save if user actually typed something
    const saveNow = useCallback((editor: EditorInstance) => {
        if (!user || shareToken || readOnly || saveGuardRef?.current) return;
        const json = editor.getJSON();
        const text = editor.getText().trim();
        if (!text) return;
        const content = JSON.stringify(json);
        if (content === lastSavedRef.current) return;
        lastSavedRef.current = content;
        const title = extractTitle(json);
        setSaveState("saving");
        saveNote(noteId, title, content, folderIdRef.current);
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => {
            setSaveState("saved");
            savedTimerRef.current = setTimeout(() => setSaveState("idle"), 3000);
        }, 400);
    }, [noteId, saveNote, user, shareToken, readOnly]);

    // Debounced save — fires 1.5s after last keystroke
    const debouncedSave = useDebouncedCallback((editor: EditorInstance) => {
        saveNow(editor);
    }, 1500);

    // Save on blur (switching tabs, clicking away)
    useEffect(() => {
        const onBlur = () => {
            if (editorRef.current) saveNow(editorRef.current);
        };
        window.addEventListener("blur", onBlur);
        return () => window.removeEventListener("blur", onBlur);
    }, [saveNow]);

    // Save on visibility change (tab hidden, minimize, etc.)
    useEffect(() => {
        const onVisChange = () => {
            if (document.visibilityState === "hidden" && editorRef.current) {
                saveNow(editorRef.current);
            }
        };
        document.addEventListener("visibilitychange", onVisChange);
        return () => document.removeEventListener("visibilitychange", onVisChange);
    }, [saveNow]);

    // Save before unload (last resort — web only, skip for shared notes)
    useEffect(() => {
        if (shareToken) return;
        const isTauri = "__TAURI_INTERNALS__" in window;
        const onBeforeUnload = () => {
            if (saveGuardRef?.current) return; // content reset in progress
            if (editorRef.current && !isTauri) {
                const text = editorRef.current.getText().trim();
                if (!text) return;
                const json = editorRef.current.getJSON();
                const content = JSON.stringify(json);
                if (content !== lastSavedRef.current) {
                    const title = extractTitle(json);
                    try { navigator.sendBeacon("/api/notes", JSON.stringify({ id: noteId, title, content })); } catch {}
                }
            }
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [noteId, shareToken]);

    // Periodic background save every 10s as safety net
    useEffect(() => {
        const interval = setInterval(() => {
            if (editorRef.current) saveNow(editorRef.current);
        }, 10000);
        return () => clearInterval(interval);
    }, [saveNow]);

    // Load: IndexedDB + HTTP in parallel. HTTP content is authoritative —
    // it may be newer than IndexedDB (e.g. desktop edited via HTTP while
    // web's Yjs state was stale). We bootstrap into the Yjs doc via TipTap.
    const bootstrapRef = useRef<JSONContent | null>(null);
    useEffect(() => {
        let cancelled = false;

        const persistenceReady = provider.persistence
            ? provider.persistence.whenSynced
            : Promise.resolve();
        const waitForPersistence = compact
            ? persistenceReady
            : Promise.race([persistenceReady, new Promise((r) => setTimeout(r, 150))]);

        // Shared notes get content from WebSocket sync — skip HTTP bootstrap
        if (shareToken) {
            waitForPersistence.then(() => { if (!cancelled) setReady(true); });
            return () => { cancelled = true; };
        }

        // Fetch HTTP content in parallel with IndexedDB
        const httpContent = Promise.race([
            adapter.getNote(noteId).catch(() => null),
            new Promise((r) => setTimeout(() => r(null), 500)),
        ]);

        Promise.all([waitForPersistence, httpContent]).then(([, data]: [any, any]) => {
            if (cancelled) return;
            if (data?.content) {
                try {
                    const parsed = typeof data.content === "string" ? JSON.parse(data.content) : data.content;
                    if (parsed?.type === "doc" && parsed.content?.length) {
                        bootstrapRef.current = parsed;
                    }
                } catch {}
            }
            setReady(true);
        });

        return () => { cancelled = true; };
    }, [noteId, ydoc, provider, adapter]);

    // Connect WS after auth (web only — desktop uses local-first sync)
    useEffect(() => {
        const isTauri = "__TAURI_INTERNALS__" in window;
        if (user && ready && !isTauri) provider.connect();
    }, [user, ready, provider]);

    // Ref so unmount cleanup always calls the latest saveNow without dep churn
    const saveNowRef = useRef(saveNow);
    saveNowRef.current = saveNow;

    useEffect(() => () => {
        // On content reset (checkout/restore/merge), cancel pending saves
        // so they don't overwrite the new content. Otherwise flush normally.
        if (saveGuardRef?.current) {
            debouncedSave.cancel();
            saveGuardRef.current = false;
        } else {
            debouncedSave.flush();
            // Belt-and-suspenders: if flush was a no-op (no pending call),
            // still save — catches the case where escape fires before first debounce
            if (editorRef.current) saveNowRef.current(editorRef.current);
        }
        // Wait for IndexedDB to finish writing before destroying the doc,
        // so cycling back to this note loads the correct content.
        if (provider.persistence) {
            provider.persistence.whenSynced.then(() => {
                provider.destroy();
                ydoc.destroy();
            });
        } else {
            provider.destroy();
            ydoc.destroy();
        }
    }, [provider, ydoc, debouncedSave]);

    const collabExtensions = useMemo(() => [
        ...baseExtensions,
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({
            provider,
            user: {
                name: user?.name || "Anonymous",
                color: CURSOR_COLORS[hashStr(user?.id || "anon") % CURSOR_COLORS.length],
                id: user?.id || "anon",
            },
            render: (user) => {
                const cursor = document.createElement("span");
                cursor.classList.add("collaboration-cursor__caret");
                cursor.style.setProperty("--cursor-color", user.color);
                cursor.style.borderLeftColor = user.color;
                const label = document.createElement("span");
                label.classList.add("collaboration-cursor__label");
                label.style.backgroundColor = user.color;
                label.textContent = user.name;
                cursor.appendChild(label);
                return cursor;
            },
        }),
    ], [ydoc, provider]);

    const collaborators = useCollaborators(provider.awareness, ydoc.clientID);

    if (!ready) {
        return (
            <div className="flex items-center justify-center min-h-[500px] text-[var(--color-ink-muted)] text-sm">
                Loading...
            </div>
        );
    }

    return (
        <div className={`relative ${compact ? "min-h-[200px]" : "min-h-[500px]"}`} data-font={font}>
            {/* Collaborator avatars */}
            {collaborators.length > 0 && (
                <div className="absolute top-5 right-6 z-10 flex items-center -space-x-2">
                    {collaborators.map((c) => (
                        <div
                            key={c.id}
                            className="relative group"
                        >
                            <img
                                src={dicebearUrl(c.id)}
                                alt={c.name}
                                className="w-7 h-7 rounded-full border-2 bg-[var(--color-paper)]"
                                style={{ borderColor: c.color }}
                            />
                            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap bg-[var(--color-ink)] text-[var(--color-paper)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                {c.name}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Toolbar — font + lines toggle (hidden for read-only and compact) */}
            {!readOnly && !compact && <div className="absolute top-5 left-6 z-10 flex items-center gap-1.5">
                <button
                    onClick={cycleFont}
                    className="text-xs px-2.5 py-1 rounded-lg border border-[var(--color-border-warm)] bg-[var(--color-paper)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
                    title={`Font: ${FONT_LABELS[font]}`}
                >
                    <span style={FONT_STYLES[font]}>Aa</span>
                </button>
                <button
                    onClick={toggleLines}
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                        showLines
                            ? "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 text-[var(--color-accent)]"
                            : "border-[var(--color-border-warm)] bg-[var(--color-paper)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                    }`}
                    title={showLines ? "Hide lines" : "Show lines"}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>
            </div>}

            <EditorRoot>
                <EditorContent
                    extensions={collabExtensions}
                    editable={!readOnly}
                    className={`${compact ? "px-4 py-3" : "px-10 py-14 sm:px-16 sm:py-20"} ${showLines ? "editor-ruled-bg" : ""} ${readOnly ? "cursor-default" : ""}`}
                    editorProps={{
                        handleDOMEvents: {
                            keydown: (_view, event) => readOnly ? false : handleCommandNavigation(event),
                        },
                        attributes: {
                            class: `focus:outline-none max-w-full ${compact ? "min-h-[180px]" : "min-h-[400px]"} ${readOnly ? "select-text" : ""}`,
                        },
                    }}
                    onUpdate={({ editor }) => {
                        if (!readOnly) debouncedSave(editor);
                        updateCounts(editor);
                    }}
                    onCreate={({ editor }) => {
                        editorRef.current = editor;
                        if (bootstrapRef.current) {
                            editor.commands.setContent(bootstrapRef.current);
                            bootstrapRef.current = null;
                        }
                        if (!readOnly) editor.commands.focus("end");
                        updateCounts(editor);
                    }}
                >
                    {/* Hide formatting tools for read-only */}
                    {!readOnly && (
                        <EditorBubble className="flex items-center gap-0.5 rounded-lg border border-[var(--color-border-warm)] bg-[var(--color-card)] px-1 py-1 shadow-lg">
                            <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleBold().run()}>
                                <button className="p-1.5 rounded hover:bg-[var(--color-border-warm)] transition-colors"><BoldIcon size={16} /></button>
                            </EditorBubbleItem>
                            <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleItalic().run()}>
                                <button className="p-1.5 rounded hover:bg-[var(--color-border-warm)] transition-colors"><ItalicIcon size={16} /></button>
                            </EditorBubbleItem>
                            <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleUnderline().run()}>
                                <button className="p-1.5 rounded hover:bg-[var(--color-border-warm)] transition-colors"><UnderlineIcon size={16} /></button>
                            </EditorBubbleItem>
                            <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleStrike().run()}>
                                <button className="p-1.5 rounded hover:bg-[var(--color-border-warm)] transition-colors"><StrikethroughIcon size={16} /></button>
                            </EditorBubbleItem>
                            <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleCode().run()}>
                                <button className="p-1.5 rounded hover:bg-[var(--color-border-warm)] transition-colors"><CodeIcon size={16} /></button>
                            </EditorBubbleItem>
                        </EditorBubble>
                    )}

                    {!readOnly && (
                        <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto rounded-xl border border-[var(--color-border-warm)] bg-[var(--color-card)] px-1 py-2 shadow-xl">
                            <EditorCommandEmpty className="px-3 py-2 text-sm text-[var(--color-ink-muted)]">No results</EditorCommandEmpty>
                            <EditorCommandList>
                                {suggestionItems.map((item) => (
                                    <EditorCommandItem
                                        value={item.title}
                                        onCommand={(val) => item.command?.(val)}
                                        key={item.title}
                                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-border-warm)] data-[selected=true]:bg-[var(--color-border-warm)] cursor-pointer transition-colors"
                                    >
                                        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border-warm)] bg-[var(--color-paper)]">
                                            {item.icon}
                                        </div>
                                        <div>
                                            <p className="font-medium text-[var(--color-ink)]">{item.title}</p>
                                            <p className="text-xs text-[var(--color-ink-muted)]">{item.description}</p>
                                        </div>
                                    </EditorCommandItem>
                                ))}
                            </EditorCommandList>
                        </EditorCommand>
                    )}
                </EditorContent>
            </EditorRoot>

            {/* Status bar — bottom (hidden in compact mode) */}
            {!readOnly && !shareToken && !compact && (
                <div className="absolute bottom-4 left-6 right-6 z-10 flex items-center justify-between pointer-events-none">
                    <span
                        className="group pointer-events-auto text-[10px] tracking-wide text-[var(--color-ink-muted)]/40 hover:text-[var(--color-ink-muted)] transition-colors cursor-default select-none"
                        title={`${wordCount.toLocaleString()} words · ${charCount.toLocaleString()} characters · ${Math.max(1, Math.ceil(wordCount / 250))} pages`}
                    >
                        <span className="group-hover:hidden">{wordCount.toLocaleString()} words</span>
                        <span className="hidden group-hover:inline">{wordCount.toLocaleString()} words · {charCount.toLocaleString()} chars · {Math.max(1, Math.ceil(wordCount / 250))}p</span>
                    </span>
                    <span className="pointer-events-auto">
                        <SaveIndicator saveState={saveState} />
                    </span>
                </div>
            )}
        </div>
    );
}
