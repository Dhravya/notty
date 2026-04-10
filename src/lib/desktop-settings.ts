export type DesktopSettings = {
    cloudUrl: string;
    sessionToken: string | null;
};

const DEFAULTS: DesktopSettings = {
    cloudUrl: "https://notty.page",
    sessionToken: null,
};

export async function getDesktopSettings(): Promise<DesktopSettings> {
    try {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("settings.json");
        const cloudUrl = await store.get<string>("cloudUrl");
        const sessionToken = await store.get<string>("sessionToken");
        return { cloudUrl: cloudUrl || DEFAULTS.cloudUrl, sessionToken: sessionToken || null };
    } catch {
        return DEFAULTS;
    }
}

export async function setDesktopSettings(settings: Partial<DesktopSettings>): Promise<void> {
    try {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("settings.json");
        if (settings.cloudUrl !== undefined) await store.set("cloudUrl", settings.cloudUrl);
        await store.save();
    } catch {}
}
