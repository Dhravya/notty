// Reads the encrypted .env and writes it as a TS module so it gets bundled into the worker.
const content = await Bun.file(".env").text();
const escaped = JSON.stringify(content);
await Bun.write(
    "src/server/env.generated.ts",
    `// Auto-generated — do not edit. Run: bun scripts/bundle-env.ts\nexport const ENCRYPTED_ENV = ${escaped};\n`
);
console.log("[bundle-env] Generated src/server/env.generated.ts");
