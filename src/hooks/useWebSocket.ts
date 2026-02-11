import { useCallback, useEffect, useRef, useState } from "react";
import type { WsState } from "../lib/types";

interface UseWebSocketOptions {
  /** URL to connect to. */
  url: string | null;
  /** Called when a message is received. */
  onMessage?: (data: unknown) => void;
  /** Reconnect delay in ms (0 = no reconnect). */
  reconnectDelay?: number;
}

interface UseWebSocketReturn {
  state: WsState;
  send: (data: string) => void;
  close: () => void;
}

/**
 * Custom hook for WebSocket connections with automatic reconnection.
 */
export function useWebSocket({
  url,
  onMessage,
  reconnectDelay = 3000,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [state, setState] = useState<WsState>("closed");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const onMessageRef = useRef(onMessage);
  const urlRef = useRef(url);

  // Keep refs up to date without triggering reconnects
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const connect = useCallback(() => {
    const currentUrl = urlRef.current;
    if (!currentUrl) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    setState("connecting");
    const ws = new WebSocket(currentUrl);

    ws.onopen = () => {
      setState("open");
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        onMessageRef.current?.(data);
      } catch {
        // Non-JSON message, pass raw
        onMessageRef.current?.(ev.data);
      }
    };

    ws.onerror = () => {
      setState("error");
    };

    ws.onclose = () => {
      setState("closed");
      wsRef.current = null;
      if (reconnectDelay > 0 && urlRef.current) {
        reconnectTimer.current = setTimeout(connect, reconnectDelay);
      }
    };

    wsRef.current = ws;
  }, [reconnectDelay]);

  // Connect when URL changes
  useEffect(() => {
    if (url) {
      connect();
    } else {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setState("closed");
    }

    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [url, connect]);

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const close = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setState("closed");
  }, []);

  return { state, send, close };
}
