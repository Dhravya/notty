interface Env {
    AUTH_DO: DurableObjectNamespace;
    USER_NOTES_DO: DurableObjectNamespace;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
    APPLE_CLIENT_ID?: string;
    APPLE_PRIVATE_KEY?: string;
    APPLE_TEAM_ID?: string;
    APPLE_KEY_ID?: string;
    APPLE_APP_BUNDLE_IDENTIFIER?: string;
    BASE_DOMAIN?: string;
    ASSETS: Fetcher;
}

declare namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends globalThis.Env {}
}
