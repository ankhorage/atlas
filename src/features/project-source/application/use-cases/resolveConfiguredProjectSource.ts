import { resolveAnkhInputValue } from '@ankhorage/ankh';

import { parseProjectSource } from '@/features/project-source/application/use-cases/parseProjectSource';
import { PROJECT_SOURCE_POLICY } from '@/features/project-source/constants/projectSource';

/*** Resolve PKGViz source candidates through the canonical Ankh input precedence. */
export function resolveConfiguredProjectSource(candidates: ConfiguredProjectSourceCandidates) {
  const resolved = resolveAnkhInputValue({
    explicit: candidates.explicit,
    cli: candidates.cli,
    environment: candidates.environment,
    defaultValue: PROJECT_SOURCE_POLICY.defaultValue,
  });
  if (resolved === null) throw new Error('Unable to resolve a PKGViz project source.');

  return {
    origin: resolved.origin,
    source: parseProjectSource(resolved.value),
  };
}

interface ConfiguredProjectSourceCandidates {
  readonly explicit?: string | null;
  readonly cli?: string | null;
  readonly environment?: string | null;
}
