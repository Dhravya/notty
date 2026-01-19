import { useEffect, useState, useCallback, useRef } from "react";

interface CollaborationState {
  isConnected: boolean;
  connectedUsers: string[];
  error: string | null;
}

interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export function useCollaboration(noteId: string, user: AuthUser | null) {
  const [state, setState] = useState<CollaborationState>({
    isConnected: false,
    connectedUsers: [],
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!user || wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/sync/${noteId}?userId=${encodeURIComponent(user.email)}&userName=${encodeURIComponent(user.name)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((prev) => ({ ...prev, isConnected: true, error: null }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "awareness") {
          if (message.data.action === "join") {
            setState((prev) => ({
              ...prev,
              connectedUsers: [...new Set([...prev.connectedUsers, message.userName || message.userId])],
            }));
          } else if (message.data.action === "leave") {
            setState((prev) => ({
              ...prev,
              connectedUsers: prev.connectedUsers.filter((u) => u !== message.userId && u !== message.userName),
            }));
          } else if (message.data.action === "users") {
            setState((prev) => ({
              ...prev,
              connectedUsers: message.data.users || [],
            }));
          }
        }
      } catch (error) {
        console.error("WebSocket message parse error:", error);
      }
    };

    ws.onclose = () => {
      setState((prev) => ({ ...prev, isConnected: false }));
      wsRef.current = null;

      // Attempt to reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      setState((prev) => ({ ...prev, error: "Connection error" }));
    };
  }, [noteId, user]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendUpdate = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && user) {
      wsRef.current.send(
        JSON.stringify({
          type: "update",
          data,
          userId: user.email,
        })
      );
    }
  }, [user]);

  const sendCursor = useCallback((position: { x: number; y: number }) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && user) {
      wsRef.current.send(
        JSON.stringify({
          type: "cursor",
          data: position,
          userId: user.email,
          userName: user.name,
        })
      );
    }
  }, [user]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    ...state,
    sendUpdate,
    sendCursor,
    reconnect: connect,
  };
}
