import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { IndexeddbPersistence } from "y-indexeddb";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

export class NottyProvider {
    doc: Y.Doc;
    awareness: awarenessProtocol.Awareness;
    persistence: IndexeddbPersistence;
    private ws: WebSocket | null = null;
    private connected = false;
    private destroyed = false;
    private pendingUpdates: Uint8Array[] = [];
    private serverUrl: string | null = null;
    private reconnectDelay = 1000;

    private shareToken: string | undefined;
    private offlineOnly: boolean;

    constructor(
        private noteId: string,
        doc: Y.Doc,
        options?: { connect?: boolean; shareToken?: string }
    ) {
        this.doc = doc;
        this.awareness = new awarenessProtocol.Awareness(doc);
        this.offlineOnly = options?.connect === false;
        this.shareToken = options?.shareToken;

        // Offline persistence — loads cached doc from IndexedDB immediately
        this.persistence = new IndexeddbPersistence(`notty-${noteId}`, doc);

        this.doc.on("update", (update: Uint8Array, origin: any) => {
            if (origin === this) return;
            if (this.connected) {
                this.sendUpdate(update);
            } else {
                // Queue updates while offline — they'll sync on reconnect
                this.pendingUpdates.push(update);
            }
        });

        this.awareness.on("update", ({ added, updated, removed }: any) => {
            const changed = added.concat(updated).concat(removed);
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MSG_AWARENESS);
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
            );
            this.broadcastMessage(encoding.toUint8Array(encoder));
        });

        if (options?.connect !== false) this.connect();
    }

    setServerUrl(url: string) {
        this.serverUrl = url;
    }

    connect() {
        if (this.destroyed || this.offlineOnly) return;
        let wsUrl: string;
        if (this.serverUrl) {
            const proto = this.serverUrl.startsWith("https") ? "wss:" : "ws:";
            const host = this.serverUrl.replace(/^https?:\/\//, "");
            wsUrl = `${proto}//${host}/api/sync?noteId=${this.noteId}`;
            if (this.shareToken) wsUrl += `&share=${encodeURIComponent(this.shareToken)}`;
        } else {
            const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
            wsUrl = `${proto}//${window.location.host}/api/sync?noteId=${this.noteId}`;
            if (this.shareToken) wsUrl += `&share=${encodeURIComponent(this.shareToken)}`;
        }
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        this.ws = ws;

        ws.onopen = () => {
            this.connected = true;
            this.reconnectDelay = 1000;

            // Sync step 1 — tells server what we have, server sends what we're missing
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MSG_SYNC);
            syncProtocol.writeSyncStep1(encoder, this.doc);
            ws.send(encoding.toUint8Array(encoder));

            // Flush any updates queued while offline
            for (const update of this.pendingUpdates) {
                this.sendUpdate(update);
            }
            this.pendingUpdates = [];

            // Send awareness
            if (this.awareness.getLocalState() !== null) {
                const ae = encoding.createEncoder();
                encoding.writeVarUint(ae, MSG_AWARENESS);
                encoding.writeVarUint8Array(
                    ae,
                    awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID])
                );
                ws.send(encoding.toUint8Array(ae));
            }
        };

        ws.onmessage = (event) => {
            const data = new Uint8Array(event.data);
            const decoder = decoding.createDecoder(data);
            const msgType = decoding.readVarUint(decoder);

            if (msgType === MSG_SYNC) {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, MSG_SYNC);
                syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
                if (encoding.length(encoder) > 1) {
                    ws.send(encoding.toUint8Array(encoder));
                }
            } else if (msgType === MSG_AWARENESS) {
                const update = decoding.readVarUint8Array(decoder);
                awarenessProtocol.applyAwarenessUpdate(this.awareness, update, this);
            }
        };

        ws.onclose = () => {
            this.connected = false;
            if (!this.destroyed) {
                // Exponential backoff: 2s, 4s, 8s, max 30s
                this.reconnectDelay = Math.min((this.reconnectDelay || 1000) * 2, 30000);
                setTimeout(() => this.connect(), this.reconnectDelay);
            }
        };

        ws.onerror = () => {
            this.connected = false;
            ws.close();
        };
    }

    private sendUpdate(update: Uint8Array) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        this.ws.send(encoding.toUint8Array(encoder));
    }

    private broadcastMessage(data: Uint8Array) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(data);
    }

    destroy() {
        this.destroyed = true;
        this.awareness.destroy();
        this.persistence.destroy();
        this.ws?.close();
        this.ws = null;
    }
}
