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
    await fetch(`${settings.cloudUrl}/api/auth/exchange-token?token=${token}`, {
        credentials: "include",
    });
    window.location.reload();
}
