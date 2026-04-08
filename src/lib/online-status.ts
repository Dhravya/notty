import { useState, useEffect, useSyncExternalStore } from "react";

let online = typeof navigator !== "undefined" ? navigator.onLine : true;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

if (typeof window !== "undefined") {
    const update = () => {
        online = navigator.onLine;
        listeners.forEach((cb) => cb());
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
}

export function useOnlineStatus(): boolean {
    return useSyncExternalStore(subscribe, () => online, () => true);
}

export function isOnline(): boolean {
    return online;
}
