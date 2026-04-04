import { useIsDark, toggleDarkMode } from "@/lib/dark-mode";

export function DarkModeToggle() {
    const dark = useIsDark();

    return (
        <button
            onClick={toggleDarkMode}
            className="p-1.5 rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)] hover:text-[var(--color-ink)] transition-colors duration-150"
            aria-label="Toggle dark mode"
        >
            <div className="relative w-[18px] h-[18px]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="absolute inset-0 transition-all duration-300"
                    style={{ opacity: dark ? 1 : 0, transform: dark ? "rotate(0deg) scale(1)" : "rotate(-90deg) scale(0.5)" }}
                >
                    <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="absolute inset-0 transition-all duration-300"
                    style={{ opacity: dark ? 0 : 1, transform: dark ? "rotate(90deg) scale(0.5)" : "rotate(0deg) scale(1)" }}
                >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
            </div>
        </button>
    );
}
