import satori from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
// @ts-expect-error wasm import
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
let wasmReady = false;

async function ensureWasm() {
    if (wasmReady) return;
    await initWasm(resvgWasm);
    wasmReady = true;
}

const WIDTH = 1200;
const HEIGHT = 630;

/** Extract title from first heading in TipTap JSON */
function extractTitle(content: string): string {
    try {
        const doc = typeof content === "string" ? JSON.parse(content) : content;
        if (!doc?.content?.[0]?.content) return "Untitled";
        return doc.content[0].content.map((n: any) => n.text || "").join("").trim() || "Untitled";
    } catch {
        return "Untitled";
    }
}

/** Extract content lines (skipping title heading) for preview */
function extractContentLines(content: string, maxLines = 6): string[] {
    try {
        const doc = typeof content === "string" ? JSON.parse(content) : content;
        if (!doc?.content) return [];
        const lines: string[] = [];
        for (const node of doc.content.slice(1)) {
            if (lines.length >= maxLines) break;
            const parts: string[] = [];
            function walk(n: any) {
                if (n.type === "text" && n.text) parts.push(n.text);
                if (n.content) n.content.forEach(walk);
            }
            walk(node);
            const line = parts.join("").trim();
            if (line) lines.push(line.length > 80 ? line.slice(0, 80) + "…" : line);
        }
        return lines;
    } catch {
        return [];
    }
}

async function loadFont(): Promise<ArrayBuffer> {
    const res = await fetch(
        "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap"
    );
    const css = await res.text();
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
    const fontRes = await fetch(urls[0]);
    return fontRes.arrayBuffer();
}

let fontCache: ArrayBuffer | null = null;
let logoCache: string | null = null;

async function getLogoDataUri(logoUrl: string): Promise<string> {
    if (logoCache) return logoCache;
    const res = await fetch(logoUrl);
    const buf = await res.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    logoCache = `data:image/png;base64,${b64}`;
    return logoCache;
}

export async function generateOgImage(
    noteTitle: string,
    content: string,
    logoUrl: string,
): Promise<ArrayBuffer> {
    await ensureWasm();
    if (!fontCache) fontCache = await loadFont();

    const title = (noteTitle === "Untitled" || !noteTitle) ? extractTitle(content) : noteTitle;
    const lines = extractContentLines(content);
    const logoDataUri = await getLogoDataUri(logoUrl);

    // Content lines with decreasing opacity for fade effect
    const contentChildren = lines.map((line, i) => ({
        type: "div",
        props: {
            style: {
                fontSize: "22px",
                color: "#2C2416",
                lineHeight: 1.6,
                opacity: Math.max(0.15, 1 - i * 0.18),
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" as const,
            },
            children: line,
        },
    }));

    const svg = await satori(
        ({
            type: "div",
            props: {
                style: {
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    padding: "56px 72px",
                    background: "linear-gradient(160deg, #FAF8F5 0%, #F0ECE4 100%)",
                    fontFamily: "DM Sans",
                },
                children: [
                    // Logo + branding
                    {
                        type: "div",
                        props: {
                            style: {
                                display: "flex",
                                alignItems: "center",
                                gap: "14px",
                                marginBottom: "40px",
                            },
                            children: [
                                {
                                    type: "img",
                                    props: {
                                        src: logoDataUri,
                                        width: 40,
                                        height: 40,
                                        style: { borderRadius: "10px" },
                                    },
                                },
                                {
                                    type: "div",
                                    props: {
                                        style: {
                                            fontSize: "20px",
                                            color: "#8C8474",
                                            fontWeight: 500,
                                            letterSpacing: "0.02em",
                                        },
                                        children: "Shared via Notty",
                                    },
                                },
                            ],
                        },
                    },
                    // Title
                    {
                        type: "div",
                        props: {
                            style: {
                                fontSize: title.length > 40 ? "40px" : "48px",
                                fontWeight: 700,
                                color: "#2C2416",
                                lineHeight: 1.2,
                                marginBottom: "28px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                            },
                            children: title,
                        },
                    },
                    // Separator
                    {
                        type: "div",
                        props: {
                            style: {
                                width: "60px",
                                height: "3px",
                                background: "#2AA198",
                                borderRadius: "2px",
                                marginBottom: "24px",
                            },
                            children: "",
                        },
                    },
                    // Content preview with fade
                    ...(contentChildren.length > 0
                        ? contentChildren
                        : [{
                              type: "div",
                              props: {
                                  style: { fontSize: "22px", color: "#8C8474" },
                                  children: "",
                              },
                          }]),
                ],
            },
        }) as any,
        {
            width: WIDTH,
            height: HEIGHT,
            fonts: [
                { name: "DM Sans", data: fontCache, weight: 400, style: "normal" as const },
                { name: "DM Sans", data: fontCache, weight: 500, style: "normal" as const },
                { name: "DM Sans", data: fontCache, weight: 700, style: "normal" as const },
            ],
        }
    );

    const resvg = new Resvg(svg, {
        fitTo: { mode: "width" as const, value: WIDTH },
    });
    const png = resvg.render();
    return png.asPng().buffer as ArrayBuffer;
}
