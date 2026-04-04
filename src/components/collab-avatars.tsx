import { useState, useEffect } from "react";
import type { Awareness } from "y-protocols/awareness";

type AwarenessUser = { name: string; color: string };

export function CollabAvatars({ awareness }: { awareness: Awareness | null }) {
    const [users, setUsers] = useState<Map<number, AwarenessUser>>(new Map());

    useEffect(() => {
        if (!awareness) return;

        const update = () => {
            const states = awareness.getStates();
            const u = new Map<number, AwarenessUser>();
            states.forEach((state, clientId) => {
                if (clientId !== awareness.clientID && state.user) {
                    u.set(clientId, state.user as AwarenessUser);
                }
            });
            setUsers(u);
        };

        awareness.on("change", update);
        update();
        return () => { awareness.off("change", update); };
    }, [awareness]);

    if (users.size === 0) return null;

    return (
        <div className="flex items-center -space-x-1.5">
            {Array.from(users.values()).slice(0, 5).map((user, i) => (
                <div
                    key={i}
                    className="w-6 h-6 rounded-full border-2 border-[var(--color-card)] flex items-center justify-center text-[9px] font-medium text-white"
                    style={{ backgroundColor: user.color }}
                    title={user.name}
                >
                    {user.name.charAt(0).toUpperCase()}
                </div>
            ))}
            {users.size > 5 && (
                <div className="w-6 h-6 rounded-full border-2 border-[var(--color-card)] bg-[var(--color-ink-muted)] flex items-center justify-center text-[9px] font-medium text-white">
                    +{users.size - 5}
                </div>
            )}
        </div>
    );
}
