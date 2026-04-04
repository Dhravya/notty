import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";

export function SharedResolvePage() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();

    useEffect(() => {
        if (!token) return;
        fetch(`/api/shared/${token}`, {
            headers: { "Accept": "application/json" },
        })
            .then((res) => res.ok ? res.json() : null)
            .then((data: any) => {
                if (data?.noteId) {
                    navigate(`/note/${data.noteId}?share=${token}`, { replace: true });
                } else {
                    navigate("/", { replace: true });
                }
            })
            .catch(() => navigate("/", { replace: true }));
    }, [token, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-paper)]">
            <p className="text-sm text-[var(--color-ink-muted)]">Opening shared note...</p>
        </div>
    );
}
