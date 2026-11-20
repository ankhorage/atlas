import { WorkspaceLoadingAcceptance } from './WorkspaceLoadingAcceptance';

/*** Serves the real Atlas loading branch with an explicit theme for first-frame acceptance. */
export default async function WorkspaceLoadingAcceptancePage({
  searchParams,
}: WorkspaceLoadingAcceptancePageProps) {
  const { mode } = await searchParams;
  if (mode !== 'dark' && mode !== 'light')
    throw new Error('A supported loading theme is required.');
  return <WorkspaceLoadingAcceptance mode={mode} />;
}

interface WorkspaceLoadingAcceptancePageProps {
  readonly searchParams: Promise<{ readonly mode?: string }>;
}
