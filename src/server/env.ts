import { parse } from "@dotenvx/dotenvx";
// Generated at build time by scripts/bundle-env.ts
import { ENCRYPTED_ENV } from "./env.generated";

let loaded = false;

export function loadEnv() {
    if (loaded) return;
    loaded = true;

    const privateKey = process.env.DOTENV_PRIVATE_KEY;
    if (!privateKey) return;

    const parsed = parse(ENCRYPTED_ENV, { privateKey, processEnv: {} });
    for (const [key, value] of Object.entries(parsed)) {
        if (key === "DOTENV_PUBLIC_KEY") continue;
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}
