import type { ProjectSource } from '@/types/projectSource';

/*** Parse one CLI/UI source without duplicating provider-specific GitHub URL validation. */
export function parseProjectSource(value: string): ProjectSource {
  const source = value.trim();
  if (source === '') throw new Error('Project source must not be empty.');

  if (source.startsWith('https://github.com/')) {
    return { kind: 'github', url: source };
  }
  if (source.includes('://')) {
    throw new Error(
      'Only local project paths and https://github.com repository URLs are supported.'
    );
  }
  return { kind: 'filesystem', path: source };
}
