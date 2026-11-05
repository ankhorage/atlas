import { describe, expect, it } from '@artiphishle/testosterone';
import type { RuleEvaluationResult } from '@ankhorage/rules';

import {
  formatRuleDagStatus,
  projectRuleDag,
} from '@/features/rule-explorer/domain/projectRuleDag';

describe('[projectRuleDag]', () => {
  it('retains scoped shared dependencies, statuses, and factual execution provenance', () => {
    const projection = projectRuleDag(FIXTURE);

    expect(projection.graph.nodes.map(node => node.id)).toEqual([
      'workspace:root',
      'package:root',
      'package:shared',
      'workspace:failed',
      'workspace:incomplete',
      'workspace:error',
      'workspace:skipped',
    ]);
    expect(projection.graph.edges.filter(edge => edge.target === 'package:shared')).toHaveLength(3);
    expect(projection.graph.nodes.find(node => node.id === 'workspace:root')?.data.provenance).toBe(
      'cache-hit'
    );
    expect(projection.graph.nodes.find(node => node.id === 'workspace:error')?.data.status).toBe(
      'ERROR'
    );
    expect(formatRuleDagStatus(null)).toBe('NOT EXECUTED');
  });

  it('filters only by declared versioned facets without changing stable node identities', () => {
    const projection = projectRuleDag(FIXTURE, [{ id: 'heading', values: ['architecture'] }]);

    expect(projection.graph.nodes.map(node => node.id)).toEqual([
      'workspace:root',
      'package:root',
      'package:shared',
      'workspace:failed',
      'workspace:incomplete',
      'workspace:error',
    ]);
    expect(projection.graph.edges.every(edge => edge.source !== 'workspace:skipped')).toBe(true);
  });
});

const FIXTURE: RuleEvaluationResult = {
  diagnostics: [],
  findings: [],
  plan: {
    diagnostics: [],
    rootRuleIds: ['root', 'failed', 'incomplete', 'error', 'skipped'],
    nodes: [
      planNode('workspace:root', 'root', 'workspace', ['package-child', 'shared'], 'architecture'),
      planNode('package:root', 'package-child', 'package', ['shared'], 'architecture'),
      planNode('package:shared', 'shared', 'package', [], 'architecture'),
      planNode('workspace:failed', 'failed', 'workspace', ['shared'], 'architecture'),
      planNode('workspace:incomplete', 'incomplete', 'workspace', [], 'architecture'),
      planNode('workspace:error', 'error', 'workspace', [], 'architecture'),
      planNode('workspace:skipped', 'skipped', 'workspace', [], 'legacy'),
    ],
  },
  results: [
    result('root', 'workspace', 'PASS', 'cache-hit'),
    result('package-child', 'package', 'PASS', 'evaluated'),
    result('shared', 'package', 'PASS', 'evaluated'),
    result('failed', 'workspace', 'FAIL', 'evaluated'),
    result('incomplete', 'workspace', 'INCOMPLETE', 'not-executed'),
    result('error', 'workspace', 'ERROR', 'evaluated'),
    result('skipped', 'workspace', 'SKIPPED', 'unknown'),
  ],
};

function planNode(
  id: string,
  ruleId: string,
  scopeKind: string,
  dependencyRuleIds: readonly string[],
  heading: string
) {
  return {
    id,
    dependencyRuleIds,
    facets: [{ id: 'heading', value: heading, version: '1' }],
    rule: { id: ruleId, version: '1.0.0' },
    scope: { id: scopeKind, kind: scopeKind },
  } as const;
}

function result(
  ruleId: string,
  scope: string,
  status: 'ERROR' | 'FAIL' | 'INCOMPLETE' | 'PASS' | 'SKIPPED',
  execution: 'cache-hit' | 'evaluated' | 'not-executed' | 'unknown'
) {
  return {
    diagnostics: [],
    execution,
    findings: [],
    rule: { id: ruleId, version: '1.0.0' },
    scope: { id: scope, kind: scope },
    status,
  } as const;
}
