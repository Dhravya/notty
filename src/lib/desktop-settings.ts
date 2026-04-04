export type DesktopSettings = {
    cloudUrl: string;
};

const DEFAULTS: DesktopSettings = {
    cloudUrl: "http://localhost:8787",
};

export async function getDesktopSettings(): Promise<DesktopSettings> {
    try {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("settings.json");
        const cloudUrl = await store.get<string>("cloudUrl");
        return { cloudUrl: cloudUrl || DEFAULTS.cloudUrl };
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
