'use client';
import { Text } from '@zora/text';
import { View } from '@zora/view';
import React from 'react';

import type { Audit } from '@/types/audit';

/*** Render architecture detection separately from any explicitly configured enforcement target. */
export function ArchitectureAnalysisPanel({
  evaluation,
}: {
  readonly evaluation: Audit['evaluation'];
}) {
  if (
    evaluation.architecture.candidates.length === 0 &&
    evaluation.architectureEvaluation === undefined
  ) {
    return null;
  }

  return (
    <View gap="m" p="m">
      <Text variant="label" weight="bold">
        Architecture Analysis
      </Text>
      {evaluation.architectureEvaluation === undefined ? (
        <Text variant="caption">Detection only · no enforcement target selected</Text>
      ) : (
        <Text variant="caption">
          Target: {evaluation.architectureEvaluation.target.kind}:{' '}
          {evaluation.architectureEvaluation.target.id}
        </Text>
      )}
      {evaluation.architecture.candidates.map(candidate => (
        <View key={candidate.modelId} gap="xs">
          <Text variant="label" weight="bold">
            {candidate.modelId} · confidence {formatPercent(candidate.confidence)} · score{' '}
            {candidate.score.toFixed(2)}
          </Text>
          {candidate.supportingEvidence.map((evidence, index) => (
            <Text key={candidate.modelId + ':evidence:' + index} variant="caption">
              + {evidence.message}
            </Text>
          ))}
          {candidate.contradictions.map((contradiction, index) => (
            <Text key={candidate.modelId + ':contradiction:' + index} variant="caption">
              ! {contradiction.message}
            </Text>
          ))}
          {candidate.unavailableCapabilities.length === 0 ? null : (
            <Text variant="caption">
              Missing capabilities: {candidate.unavailableCapabilities.join(', ')}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

/*** Format normalized architecture confidence as a compact percentage. */
function formatPercent(value: number): string {
  return Math.round(value * 100) + '%';
}
