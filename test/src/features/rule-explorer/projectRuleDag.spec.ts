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
    expect(projection.availableFacets.map(facet => facet.value)).toContain('legacy');
  });

  it('retains canonical facet controls when a reversible filter hides every node', () => {
    const projection = projectRuleDag(FIXTURE, [{ id: 'heading', values: ['missing'] }]);

    expect(projection.graph.nodes).toEqual([]);
    expect(projection.availableFacets).toEqual([
      { id: 'heading', value: 'architecture', version: '1' },
      { id: 'heading', value: 'legacy', version: '1' },
    ]);
  });

  it('matches results and dependency edges only within their complete scoped identities', () => {
    const projection = projectRuleDag(SCOPED_IDENTITY_FIXTURE);

    expect(projection.graph.nodes.map(node => ({ id: node.id, status: node.data.status }))).toEqual(
      [
        { id: 'workspace:parent', status: 'PASS' },
        { id: 'workspace:shared', status: 'FAIL' },
        { id: 'package:parent', status: 'ERROR' },
        { id: 'package:shared', status: 'PASS' },
      ]
    );
    expect(projection.graph.edges.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: 'workspace:parent', target: 'workspace:shared' },
      { source: 'package:parent', target: 'package:shared' },
    ]);
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
      planNode('package:root', 'package-child', 'workspace', ['shared'], 'architecture'),
      planNode('package:shared', 'shared', 'workspace', [], 'architecture'),
      planNode('workspace:failed', 'failed', 'workspace', ['shared'], 'architecture'),
      planNode('workspace:incomplete', 'incomplete', 'workspace', [], 'architecture'),
      planNode('workspace:error', 'error', 'workspace', [], 'architecture'),
      planNode('workspace:skipped', 'skipped', 'workspace', [], 'legacy'),
    ],
  },
  results: [
    result('root', 'workspace', 'PASS', 'cache-hit'),
    result('package-child', 'workspace', 'PASS', 'evaluated'),
    result('shared', 'workspace', 'PASS', 'evaluated'),
    result('failed', 'workspace', 'FAIL', 'evaluated'),
    result('incomplete', 'workspace', 'INCOMPLETE', 'not-executed'),
    result('error', 'workspace', 'ERROR', 'evaluated'),
    result('skipped', 'workspace', 'SKIPPED', 'unknown'),
  ],
};

const SCOPED_IDENTITY_FIXTURE: RuleEvaluationResult = {
  diagnostics: [],
  findings: [],
  plan: {
    diagnostics: [],
    rootRuleIds: ['parent'],
    nodes: [
      planNode(
        'workspace:parent',
        'parent',
        'workspace',
        ['shared'],
        'architecture',
        '1.0.0',
        'shared-scope-id'
      ),
      planNode(
        'workspace:shared',
        'shared',
        'workspace',
        [],
        'architecture',
        '1.0.0',
        'shared-scope-id'
      ),
      planNode(
        'package:parent',
        'parent',
        'package',
        ['shared'],
        'architecture',
        '2.0.0',
        'shared-scope-id'
      ),
      planNode(
        'package:shared',
        'shared',
        'package',
        [],
        'architecture',
        '2.0.0',
        'shared-scope-id'
      ),
    ],
  },
  results: [
    result('parent', 'workspace', 'PASS', 'evaluated', '1.0.0', 'shared-scope-id'),
    result('shared', 'workspace', 'FAIL', 'evaluated', '1.0.0', 'shared-scope-id'),
    result('parent', 'package', 'ERROR', 'evaluated', '2.0.0', 'shared-scope-id'),
    result('shared', 'package', 'PASS', 'evaluated', '2.0.0', 'shared-scope-id'),
  ],
};

function planNode(
  id: string,
  ruleId: string,
  scopeKind: string,
  dependencyRuleIds: readonly string[],
  heading: string,
  ruleVersion = '1.0.0',
  scopeId = scopeKind
) {
  return {
    id,
    dependencyRuleIds,
    facets: [{ id: 'heading', value: heading, version: '1' }],
    rule: { id: ruleId, version: ruleVersion },
    scope: { id: scopeId, kind: scopeKind },
  } as const;
}

function result(
  ruleId: string,
  scope: string,
  status: 'ERROR' | 'FAIL' | 'INCOMPLETE' | 'PASS' | 'SKIPPED',
  execution: 'cache-hit' | 'evaluated' | 'not-executed' | 'unknown',
  ruleVersion = '1.0.0',
  scopeId = scope
) {
  return {
    diagnostics: [],
    execution,
    findings: [],
    rule: { id: ruleId, version: ruleVersion },
    scope: { id: scopeId, kind: scope },
    status,
  } as const;
}
