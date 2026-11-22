import { expect, describe, it, render } from '@artiphishle/testosterone';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { SettingsProvider } from '@/features/settings/adapters/inbound/react/SettingsProvider';
import { useSettings } from '@/features/settings/adapters/inbound/react/useSettings';

function SettingsHarness() {
  const settings = useSettings();

  return (
    <>
      <output>{JSON.stringify(settings.repositoryColors)}</output>
      <button onClick={() => settings.setRepositoryColor('R_atlas', '#AABBCC')}>Set valid</button>
      <button onClick={() => settings.setRepositoryColor('R/atlas', '#AABBCC')}>
        Set invalid ID
      </button>
      <button onClick={() => settings.setRepositoryColor('R_atlas', '#aabbcc')}>
        Set invalid color
      </button>
      <button onClick={() => settings.setRepositoryColor('R_extra', '#AABBCC')}>
        Set overflow
      </button>
    </>
  );
}

describe('[SettingsProvider repository colors]', () => {
  it('ignores invalid persisted colors and invalid color writes', async () => {
    await withStorage(
      new Map([
        ['atlas.workspace.validation.repository-colors', JSON.stringify({ 'R/atlas': '#AABBCC' })],
      ]),
      async storage => {
        const { container, root } = await renderSettings('validation');

        expect(container.querySelector('output')?.textContent).toBe('{}');
        await act(async () => button(container, 'Set invalid ID')?.click());
        await act(async () => button(container, 'Set invalid color')?.click());
        expect(container.querySelector('output')?.textContent).toBe('{}');
        await act(async () => button(container, 'Set valid')?.click());
        expect(container.querySelector('output')?.textContent).toBe('{"R_atlas":"#AABBCC"}');
        expect(storage.get('atlas.workspace.validation.repository-colors')).toBe(
          '{"R_atlas":"#AABBCC"}'
        );
        await act(async () => root.unmount());
      }
    );
  });

  it('does not exceed the persisted repository color limit', async () => {
    const colors = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`R_${index}`, '#AABBCC'])
    );
    await withStorage(
      new Map([['atlas.workspace.maximum.repository-colors', JSON.stringify(colors)]]),
      async storage => {
        const { container, root } = await renderSettings('maximum');

        await act(async () => button(container, 'Set overflow')?.click());
        expect(
          JSON.parse(storage.get('atlas.workspace.maximum.repository-colors') ?? '{}')
        ).toEqual(colors);
        await act(async () => root.unmount());
      }
    );
  });
});

/** Render a SettingsProvider in a scope backed by the test's isolated browser storage. */
async function renderSettings(workspaceScope: string) {
  const host = render(<div />);
  const root = createRoot(host.container);
  await act(async () =>
    root.render(
      <SettingsProvider workspaceScope={workspaceScope}>
        <SettingsHarness />
      </SettingsProvider>
    )
  );
  return { container: host.container, root };
}

/** Return a test action button by its accessible text. */
function button(container: HTMLElement, text: string) {
  return [...container.querySelectorAll('button')].find(button => button.textContent === text);
}

/** Run an assertion against an isolated in-memory localStorage implementation. */
async function withStorage(
  runValues: Map<string, string>,
  run: (values: Map<string, string>) => Promise<void>
) {
  const previousStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return runValues.size;
      },
      clear: () => runValues.clear(),
      getItem: (name: string) => runValues.get(name) ?? null,
      key: (index: number) => [...runValues.keys()][index] ?? null,
      removeItem: (name: string) => {
        runValues.delete(name);
      },
      setItem: (name: string, value: string) => runValues.set(name, value),
    } satisfies Storage,
  });
  try {
    await run(runValues);
  } finally {
    if (previousStorage) Object.defineProperty(window, 'localStorage', previousStorage);
    else Reflect.deleteProperty(window, 'localStorage');
  }
}
