import { useEffect, useRef } from "react";

type Handler = (e: KeyboardEvent) => void;

type HotkeyDef = {
    key: string; // e.g. "n", "mod+k", "escape", "mod+shift+p"
    handler: Handler;
    allowInInput?: boolean;
};

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

function isInputFocused(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if ((el as HTMLElement).isContentEditable) return true;
    // Novel/TipTap editor uses ProseMirror which is contenteditable
    if (el.closest(".ProseMirror")) return true;
    return false;
}

function matchesKey(e: KeyboardEvent, pattern: string): boolean {
    const parts = pattern.toLowerCase().split("+");
    const key = parts.pop()!;

    const needMod = parts.includes("mod");
    const needShift = parts.includes("shift");
    const needAlt = parts.includes("alt");

    const hasMod = isMac ? e.metaKey : e.ctrlKey;
    if (needMod !== hasMod) return false;
    if (needShift !== e.shiftKey) return false;
    if (needAlt !== e.altKey) return false;

    // Don't match if extra modifier keys are pressed (unless part of the pattern)
    if (!needMod && (e.metaKey || e.ctrlKey)) return false;

    return e.key.toLowerCase() === key;
}

export function useHotkeys(hotkeys: HotkeyDef[]) {
    const ref = useRef(hotkeys);
    ref.current = hotkeys;

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            for (const hk of ref.current) {
                if (matchesKey(e, hk.key)) {
                    if (!hk.allowInInput && isInputFocused()) continue;
                    e.preventDefault();
                    e.stopPropagation();
                    hk.handler(e);
                    return;
                }
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);
}

export { isMac };
