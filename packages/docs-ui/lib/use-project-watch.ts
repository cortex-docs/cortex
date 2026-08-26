'use client';

import { useEffect } from 'react';

const listeners = new Set<() => void>();
let eventSource: EventSource | null = null;
let refCount = 0;

function connect() {
  if (eventSource) return;
  eventSource = new EventSource('/api/docs-watch');
  eventSource.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'change') {
        for (const fn of listeners) fn();
      }
    } catch {}
  };
  eventSource.onerror = () => {
    eventSource?.close();
    eventSource = null;
    setTimeout(() => {
      if (refCount > 0) connect();
    }, 3000);
  };
}

function disconnect() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

export function useProjectWatch(onChange: () => void) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CORTEX_CLOUDFLARE === '1') return;

    listeners.add(onChange);
    refCount++;
    if (refCount === 1) connect();

    return () => {
      listeners.delete(onChange);
      refCount--;
      if (refCount === 0) disconnect();
    };
  }, [onChange]);
}
