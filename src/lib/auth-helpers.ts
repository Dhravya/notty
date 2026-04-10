export async function signInWithPasskeyTauri() {
    const { getDesktopSettings } = await import("@/lib/desktop-settings");
    const settings = await getDesktopSettings();
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(`${settings.cloudUrl}/auth/passkey?redirect=notty://auth`);
}

export async function handleDeepLinkToken(url: string) {
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token");
    if (!token) return;
    const { getDesktopSettings } = await import("@/lib/desktop-settings");
    const settings = await getDesktopSettings();
    const res = await fetch(`${settings.cloudUrl}/api/auth/exchange-token?token=${token}`);
    if (!res.ok) return;
    const data = await res.json() as { sessionToken?: string };
    if (data.sessionToken) {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("settings.json");
        await store.set("sessionToken", data.sessionToken);
        await store.save();
        // Reset cloud detection so the new token gets picked up
        const { resetCloudDetection } = await import("@/lib/desktop-adapter");
        resetCloudDetection();
    }
    window.location.reload();
}
