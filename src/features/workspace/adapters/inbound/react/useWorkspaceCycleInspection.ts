'use client';

import { useState } from 'react';

import type { CycleInspection } from '@/types/auditVisualization';

/*** Own ephemeral inspection and temporary reveal state without changing persisted filters. */
export function useWorkspaceCycleInspection() {
  const [inspection, setInspection] = useState<CycleInspection | null>(null);
  const [hiddenEvidence, setHiddenEvidence] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const change = (next: CycleInspection | null) => {
    setInspection(next);
    setHiddenEvidence(false);
    setRevealedId(null);
  };
  return {
    change,
    hiddenEvidence,
    inspection,
    revealedId,
    reveal: () => setRevealedId(inspection?.id ?? null),
    setHiddenEvidence,
  };
}
