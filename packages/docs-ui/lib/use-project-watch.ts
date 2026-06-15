'use client';

import { useEffect } from 'react';

export function useProjectWatch(onChange: () => void) {
  useEffect(() => {
    const es = new EventSource('/api/docs/watch');
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'change') onChange();
      } catch {}
    };
    return () => es.close();
  }, [onChange]);
}
