import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Subscribe to SSE events for a project.
 * Invalidates React Query caches when workers finish translating or scoring.
 * On reconnect after a drop, invalidates all project queries as a catch-up.
 */
export function useProjectEvents(projectSlug: string | undefined): void {
  const queryClient = useQueryClient();
  const hasConnected = useRef(false);

  useEffect(() => {
    if (!projectSlug) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    hasConnected.current = false;

    const url = `/api/sse/projects/${encodeURIComponent(projectSlug)}?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-entries', projectSlug] });
      queryClient.invalidateQueries({ queryKey: ['sandbox-diff', projectSlug] });
      queryClient.invalidateQueries({ queryKey: ['sandbox-status', projectSlug] });
    };

    es.onopen = () => {
      if (hasConnected.current) {
        // Reconnect after drop — catch up on missed events
        invalidateAll();
      }
      hasConnected.current = true;
    };

    es.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'heartbeat') return;

        if (data.type === 'sandbox.changed') {
          invalidateAll();
        }

        if (data.type === 'quality.changed') {
          queryClient.invalidateQueries({ queryKey: ['sandbox-entries', projectSlug] });
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; onopen handles catch-up
    };

    return () => es.close();
  }, [projectSlug, queryClient]);
}
