import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import { AdapterProvider } from "@/context/adapter-context";
import { AuthProvider } from "@/context/auth-context";
import { NotesProvider } from "@/context/notes-context";
import { FoldersProvider } from "@/context/folders-context";
import { MediaProvider } from "@/context/media-context";
import type { NottyAdapter } from "@/lib/adapter";
import { HomePage } from "./pages/home";
import { NotePage } from "./pages/note";
import { AuthPasskeyPage } from "./pages/auth-passkey";
import { SharedResolvePage } from "./pages/shared-resolve";
import { PublicSettingsPage } from "./pages/public-settings";
import "@/styles/globals.css";

const isTauri = "__TAURI_INTERNALS__" in window;

async function getAdapter(): Promise<NottyAdapter> {
    if (isTauri) {
        const { DesktopAdapter } = await import("@/lib/desktop-adapter");
        const adapter = new DesktopAdapter();
        // Sync markdown files on startup
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("sync_from_markdown");
        } catch {}
        return adapter;
    }
    const { WebAdapter } = await import("@/lib/web-adapter");
    return new WebAdapter();
}

getAdapter().then((adapter) => {
    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <BrowserRouter>
                <AdapterProvider adapter={adapter}>
                    <AuthProvider>
                        <NotesProvider>
                            <FoldersProvider>
                            <MediaProvider>
                                <Routes>
                                    <Route path="/" element={<HomePage />} />
                                    <Route path="/note/:id" element={<NotePage />} />
                                    <Route path="/auth/passkey" element={<AuthPasskeyPage />} />
                                    <Route path="/shared/:token" element={<SharedResolvePage />} />
                                    <Route path="/settings/public" element={<PublicSettingsPage />} />
                                </Routes>
                            </MediaProvider>
                            </FoldersProvider>
                        </NotesProvider>
                    </AuthProvider>
                </AdapterProvider>
            </BrowserRouter>
        </StrictMode>
    );
});
