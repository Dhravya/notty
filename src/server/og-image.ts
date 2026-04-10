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

function extractPlainText(content: string, maxLen = 280): string {
    try {
        const doc = typeof content === "string" ? JSON.parse(content) : content;
        if (!doc?.content) return "";
        const parts: string[] = [];
        function walk(nodes: any[]) {
            for (const node of nodes) {
                if (node.type === "text" && node.text) parts.push(node.text);
                if (node.content) walk(node.content);
            }
        }
        walk(doc.content.slice(1)); // skip first node (title heading)
        const text = parts.join(" ").replace(/\s+/g, " ").trim();
        return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
    } catch {
        return "";
    }
}

async function loadFont(): Promise<ArrayBuffer> {
    const res = await fetch(
        "https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700&display=swap"
    );
    const css = await res.text();
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
    // Fetch the first woff2 font file
    const fontRes = await fetch(urls[0]);
    return fontRes.arrayBuffer();
}

let fontCache: ArrayBuffer | null = null;

export async function generateOgImage(
    title: string,
    content: string
): Promise<ArrayBuffer> {
    await ensureWasm();
    if (!fontCache) fontCache = await loadFont();

    const excerpt = extractPlainText(content);

    const svg = await satori(
        ({
            type: "div",
            props: {
                style: {
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: "60px 80px",
                    background: "linear-gradient(145deg, #FAF8F5 0%, #F0ECE4 100%)",
                    fontFamily: "DM Sans",
                },
                children: [
                    {
                        type: "div",
                        props: {
                            style: {
                                display: "flex",
                                alignItems: "center",
                                marginBottom: "32px",
                                gap: "12px",
                            },
                            children: [
                                {
                                    type: "div",
                                    props: {
                                        style: {
                                            width: "36px",
                                            height: "36px",
                                            borderRadius: "8px",
                                            background: "#2C2416",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "#FAF8F5",
                                            fontSize: "18px",
                                            fontWeight: 700,
                                        },
                                        children: "N",
                                    },
                                },
                                {
                                    type: "div",
                                    props: {
                                        style: {
                                            fontSize: "20px",
                                            color: "#8C8474",
                                            fontWeight: 500,
                                        },
                                        children: "Shared via Notty",
                                    },
                                },
                            ],
                        },
                    },
                    {
                        type: "div",
                        props: {
                            style: {
                                fontSize: "52px",
                                fontWeight: 700,
                                color: "#2C2416",
                                lineHeight: 1.2,
                                marginBottom: "24px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            },
                            children: title || "Untitled",
                        },
                    },
                    excerpt
                        ? {
                              type: "div",
                              props: {
                                  style: {
                                      fontSize: "24px",
                                      color: "#8C8474",
                                      lineHeight: 1.5,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                  },
                                  children: excerpt,
                              },
                          }
                        : {
                              type: "div",
                              props: { style: { display: "none" }, children: "" },
                          },
                ],
            },
        }) as any,
        {
            width: WIDTH,
            height: HEIGHT,
            fonts: [
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
