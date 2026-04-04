import { useState, useEffect } from "react";

export function toggleDarkMode() {
    const isDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", !isDark);
    localStorage.setItem("theme", isDark ? "light" : "dark");
}

export function useIsDark() {
    const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
    useEffect(() => {
        const observer = new MutationObserver(() => {
            setDark(document.documentElement.classList.contains("dark"));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);
    return dark;
}
