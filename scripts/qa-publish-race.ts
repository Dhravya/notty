// QA script: simulate the real "publish race" the editor hits.
// 1. Create a note (empty, like createNote does)
// 2. Connect Yjs over WS, type title+body (content lives only in the DO's
//    in-memory ydoc; the 2s debounced column save has NOT fired yet)
// 3. Publish IMMEDIATELY (inside the debounce window)
// 4. Fetch the public page and assert the real title is rendered
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const BASE = "http://localhost:8787";
const COOKIE = process.env.QA_COOKIE!;
const MSG_SYNC = 0;

const h = { "Cookie": COOKIE, "Content-Type": "application/json" };

async function j(path: string, init?: RequestInit) {
    const res = await fetch(BASE + path, { ...init, headers: { ...h, ...(init?.headers || {}) } });
    return { status: res.status, text: await res.text() };
}

// --- set profile username ---
const prof = await j("/api/profile", { method: "POST", body: JSON.stringify({ username: "qatester", page_title: "QA Blog" }) });
console.log("profile:", prof.status, prof.text.slice(0, 120));

// --- create note (empty, as the client does) ---
const noteId = crypto.randomUUID();
const created = await j("/api/notes", { method: "POST", body: JSON.stringify({ id: noteId, title: "Untitled", content: "" }) });
console.log("create:", created.status);

// --- connect Yjs WS and type ---
const doc = new Y.Doc();
const frag = doc.getXmlFragment("default");

const ws = new WebSocket(`ws://localhost:8787/api/sync?noteId=${noteId}`, { headers: { Cookie: COOKIE } } as any);
ws.binaryType = "arraybuffer";

await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e: any) => reject(new Error("ws error: " + (e?.message || e)));
});
console.log("ws: connected");

ws.onmessage = (ev: MessageEvent) => {
    const data = new Uint8Array(ev.data as ArrayBuffer);
    const decoder = decoding.createDecoder(data);
    const type = decoding.readVarUint(decoder);
    if (type === MSG_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, doc, null);
        if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
    }
};

// push local updates to the server as they happen (like y-websocket)
doc.on("update", (update: Uint8Array, origin: any) => {
    if (origin === "remote") return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    ws.send(encoding.toUint8Array(encoder));
});

// initial sync step 1
{
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    ws.send(encoding.toUint8Array(encoder));
}
await new Promise((r) => setTimeout(r, 500));

// "type" the note: heading title + paragraph body
doc.transact(() => {
    const p1 = new Y.XmlElement("paragraph");
    p1.insert(0, [new Y.XmlText("Race Condition Title")]);
    const p2 = new Y.XmlElement("paragraph");
    p2.insert(0, [new Y.XmlText("Body that must appear on the public page.")]);
    frag.insert(0, [p1, p2]);
});
await new Promise((r) => setTimeout(r, Number(process.env.RACE_MS || 300))); // let the WS frame land, but stay inside the 2s debounce

// --- publish IMMEDIATELY (the race) ---
const pub = await j(`/api/notes/${noteId}/publish`, { method: "POST", body: JSON.stringify({ published: true }) });
console.log("publish:", pub.status, pub.text.slice(0, 120));

// --- verify: public note page (via subdomain Host header) ---
const pubPage = await fetch(`${BASE}/${noteId}`, { headers: { Host: "qatester.notty.page" } });
const html = await pubPage.text();
const h2 = html.match(/<h2>([^<]*)<\/h2>/)?.[1];
console.log("public note status:", pubPage.status, "| rendered title:", JSON.stringify(h2));
console.log("body present:", html.includes("Body that must appear on the public page."));

// --- verify: public index + RSS ---
const idx = await (await fetch(`${BASE}/`, { headers: { Host: "qatester.notty.page" } })).text();
console.log("index title link:", idx.match(/<h2><a[^>]*>([^<]*)<\/a><\/h2>/)?.[1]);
const rss = await (await fetch(`${BASE}/rss`, { headers: { Host: "qatester.notty.page" } })).text();
console.log("rss item title:", rss.match(/<item>\s*<title>([^<]*)<\/title>/)?.[1]);

// --- version churn test: repeated session finalizes should coalesce ---
for (let i = 1; i <= 4; i++) {
    const sess = JSON.parse((await j(`/api/notes/${noteId}/sessions`, { method: "POST", body: "{}" })).text);
    // small content change each round via HTTP save (simulates editor autosave)
    const content = JSON.stringify({ type: "doc", content: [
        { type: "paragraph", content: [{ type: "text", text: "Race Condition Title" }] },
        { type: "paragraph", content: [{ type: "text", text: `Body edit round ${i}.` }] },
    ]});
    await j("/api/notes", { method: "POST", body: JSON.stringify({ id: noteId, title: "Race Condition Title", content }) });
    const fin = await j(`/api/notes/${noteId}/sessions/${sess.sessionId}/finalize`, { method: "POST", body: JSON.stringify({ reason: "hidden" }) });
    console.log(`session ${i} finalize:`, fin.status, fin.text.slice(0, 80));
}
const hist = JSON.parse((await j(`/api/notes/${noteId}/history`)).text);
console.log("history count after 4 sessions:", hist.length);
console.log("history kinds:", hist.map((v: any) => v.kind).join(","));

// --- verify version content reconstructs from R2 ---
if (hist[0]) {
    const v = JSON.parse((await j(`/api/notes/${noteId}/history/${hist[0].id}`)).text);
    console.log("head version title:", v.title, "| content ok:", (v.content || "").includes("Body edit round"));
}

ws.close();
process.exit(0);
