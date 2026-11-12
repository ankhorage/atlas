'use client';
import { Accordion, AccordionItem } from '@ankhorage/zora/web/accordion';
import { Button, IconButton } from '@ankhorage/zora/web/button';
import { Card } from '@ankhorage/zora/web/card';
import { Text } from '@ankhorage/zora/web/text';
import { View } from '@ankhorage/zora/web/view';
import React from 'react';

import { t } from '@/i18n/i18n';
import type { CycleEdgeEvidence } from '@/types/audit';
import type { CycleInspection } from '@/types/auditVisualization';

const INSPECTOR_STYLE = {
  maxWidth: 'calc(100% - 2rem)',
  position: 'absolute',
  right: 16,
  top: 16,
  width: 384,
  zIndex: 20,
} as const;

/*** Renders detailed cycle evidence in a ZORA card outside the constrained settings sidebar. */
export function CycleInspector({
  hiddenEvidence,
  inspection,
  onClose,
  onReveal,
}: CycleInspectorProps) {
  const packageCount = new Set(inspection.cycle.packages).size;

  return (
    <aside style={INSPECTOR_STYLE}>
      <Card
        compact
        actions={
          <IconButton
            color="neutral"
            icon={{ name: 'close-outline' }}
            label={t('audit.closeInspector')}
            size="s"
            variant="ghost"
            onPress={onClose}
          />
        }
        description={`${packageCount} ${t('audit.packages')} · ${inspection.cycle.edges.length} ${t(
          'audit.dependencyEdges'
        )}`}
        title={inspection.label}
        tone="outline"
      >
        <View gap="m">
          <Text variant="label" weight="bold">
            {t('audit.cyclePath')}
          </Text>
          <Text selectable variant="code">
            {inspection.cycle.packages.join(' → ')}
          </Text>
          {hiddenEvidence && onReveal !== undefined ? (
            <View gap="xs">
              <Text emphasis="muted" variant="caption">
                {t('audit.hiddenCycleEvidence')}
              </Text>
              <Button size="s" variant="outline" onPress={onReveal}>
                {t('audit.revealCycleEvidence')}
              </Button>
            </View>
          ) : null}
          <CycleEvidence edges={inspection.cycle.edges} />
        </View>
      </Card>
    </aside>
  );
}

/*** Renders dependency evidence with canonical ZORA disclosure semantics. */
function CycleEvidence({ edges }: CycleEvidenceProps) {
  return (
    <View gap="s">
      <Text variant="label" weight="bold">
        {t('audit.dependencyEvidence')}
      </Text>
      <Accordion type="multiple">
        {edges.map((edge, index) => (
          <EvidenceEdge edge={edge} index={index} key={edge.from + '→' + edge.to + ':' + index} />
        ))}
      </Accordion>
    </View>
  );
}

/*** Renders one directed dependency edge and its source/import evidence. */
function EvidenceEdge({ edge, index }: EvidenceEdgeProps) {
  return (
    <AccordionItem
      title={`${index + 1}. ${edge.from} → ${edge.to}`}
      value={`edge-${index}-${edge.from}-${edge.to}`}
    >
      <View gap="xs">
        {edge.via.length === 0 ? (
          <Text emphasis="muted" variant="caption">
            {t('audit.noEvidence')}
          </Text>
        ) : (
          edge.via.map((evidence, evidenceIndex) => (
            <Text
              key={
                evidence.filePath +
                ':' +
                evidence.fileClass +
                ':' +
                evidence.importName +
                ':' +
                evidenceIndex
              }
              selectable
              variant="code"
            >
              {evidence.filePath} {t('audit.imports')} {evidence.importName}
            </Text>
          ))
        )}
      </View>
    </AccordionItem>
  );
}

interface CycleInspectorProps {
  readonly hiddenEvidence?: boolean;
  readonly inspection: CycleInspection;
  readonly onClose: () => void;
  readonly onReveal?: () => void;
}

interface CycleEvidenceProps {
  readonly edges: readonly CycleEdgeEvidence[];
}

interface EvidenceEdgeProps {
  readonly edge: CycleEdgeEvidence;
  readonly index: number;
}
