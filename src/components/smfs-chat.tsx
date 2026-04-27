import { useState, useRef, useEffect } from "react";
import { useSmfs } from "@/context/smfs-context";

export function SmfsChat() {
    const smfs = useSmfs();
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [smfs.messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || smfs.agentLoading) return;
        const msg = input.trim();
        setInput("");
        await smfs.sendMessage(msg);
    };

    return (
        <div className="flex flex-col border-t" style={{ borderColor: "var(--color-border-warm)" }}>
            {/* Messages */}
            {smfs.messages.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto px-3 py-2 space-y-2 text-[12px]">
                    {smfs.messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div
                                className={`max-w-[90%] rounded-lg px-2.5 py-1.5 ${
                                    msg.role === "user"
                                        ? "bg-[var(--color-sidebar-active)]"
                                        : ""
                                }`}
                                style={{ color: "var(--color-ink)" }}
                            >
                                {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                                {msg.toolCalls && msg.toolCalls.length > 0 && (
                                    <div className="mt-1 space-y-1">
                                        {msg.toolCalls.map((tc, i) => (
                                            <details key={i} className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                                                <summary className="cursor-pointer hover:underline">
                                                    $ {(tc.input as any)?.command || tc.name}
                                                </summary>
                                                {tc.result && (
                                                    <pre
                                                        className="mt-1 p-1.5 rounded text-[10px] overflow-x-auto whitespace-pre-wrap"
                                                        style={{ background: "var(--color-sidebar-active)" }}
                                                    >
                                                        {tc.result}
                                                    </pre>
                                                )}
                                            </details>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className="flex items-center gap-1.5 px-3 py-2">
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={smfs.agentLoading ? "Agent is thinking..." : "Ask the agent..."}
                    disabled={smfs.agentLoading}
                    className="flex-1 bg-transparent text-[12px] outline-none placeholder:opacity-50"
                    style={{ color: "var(--color-ink)" }}
                />
                <button
                    type="submit"
                    disabled={smfs.agentLoading || !input.trim()}
                    className="text-[12px] px-2 py-0.5 rounded-md transition-colors disabled:opacity-30"
                    style={{
                        color: "var(--color-ink)",
                        background: input.trim() ? "var(--color-sidebar-active)" : "transparent",
                    }}
                >
                    {smfs.agentLoading ? (
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    )}
                </button>
            </form>
        </div>
    );
}
