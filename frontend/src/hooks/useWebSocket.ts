import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePlayerStore } from '../store/playerStore';

interface ProgressUpdate {
  type: 'progress_updated';
  bookId: string;
  chapterId: string | null;
  position: number;
  updatedAt: string;
}

type ServerMessage = ProgressUpdate | { type: 'pong' } | { type: 'error'; message: string };

/** Manages a persistent WebSocket connection for real-time progress sync */
export function useWebSocket() {
  const { token, activeUrl } = useAuthStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttemptsRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const pingTimerRef = useRef<ReturnType<typeof setInterval>>();

  const maxReconnectAttempts = 20;

  const getWsUrl = useCallback(() => {
    if (!activeUrl) return null;
    try {
      const url = new URL(activeUrl);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = url.pathname.replace(/\/$/, '') + '/api/ws';
      return url.toString();
    } catch {
      const base = activeUrl.replace(/\/$/, '');
      const wsProtocol = base.startsWith('https') ? 'wss' : 'ws';
      return `${wsProtocol}://${new URL(base).host}/api/ws`;
    }
  }, [activeUrl]);

  const connect = useCallback(() => {
    if (!token) return;

    const wsUrl = getWsUrl();
    if (!wsUrl) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    try {
      const urlWithToken = `${wsUrl}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(urlWithToken);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
        }

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(
            1000 * Math.pow(2, reconnectAttemptsRef.current),
            30000
          );
          reconnectAttemptsRef.current += 1;
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };

      wsRef.current = ws;
    } catch {
      reconnectTimerRef.current = setTimeout(connect, 5000);
    }
  }, [token, getWsUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
    }
    reconnectAttemptsRef.current = maxReconnectAttempts;
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const sendProgress = useCallback(
    (bookId: string, chapterId: string, position: number) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'progress_update',
            book_id: bookId,
            chapter_id: chapterId,
            position: Math.floor(position),
          })
        );
      }
    },
    []
  );

  return { isConnected, sendProgress };
}

/** Handle incoming messages from the server */
function handleServerMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'progress_updated': {
      const store = usePlayerStore.getState();
      if (
        store.currentBook?.id === msg.bookId &&
        store.currentChapter?.id === msg.chapterId
      ) {
        const updatedChapters = store.chapters.map((c) =>
          c.id === msg.chapterId
            ? { ...c, progressPosition: msg.position, progressUpdatedAt: msg.updatedAt }
            : c
        );
        usePlayerStore.setState({ chapters: updatedChapters });
      }
      break;
    }
    case 'pong':
    case 'error':
      break;
  }
}
