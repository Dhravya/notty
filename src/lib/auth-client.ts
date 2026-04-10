import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

// Better Auth rejects non-http origins (like tauri://localhost), so we must provide an explicit baseURL
const needsExplicitBase = typeof window !== "undefined" &&
  window.location?.protocol !== "http:" &&
  window.location?.protocol !== "https:";

export const authClient = createAuthClient({
  baseURL: needsExplicitBase ? "https://notty.page" : undefined!,
  plugins: [anonymousClient(), passkeyClient()],
});

export function createDesktopAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [anonymousClient(), passkeyClient()],
  });
}
