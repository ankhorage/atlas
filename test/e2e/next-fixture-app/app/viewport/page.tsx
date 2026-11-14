import { ViewportAcceptanceGraph } from './ViewportAcceptanceGraph';

/*** Renders a deterministic repository-count matrix through Atlas's production viewport owner. */
export default async function ViewportAcceptancePage({
  searchParams,
}: ViewportAcceptancePageProps) {
  const parameters = await searchParams;
  const repositoryCount = Number(parameters.repositories);
  if (![5, 20, 87].includes(repositoryCount))
    throw new Error('Unsupported repository matrix size.');
  return <ViewportAcceptanceGraph repositoryCount={repositoryCount} />;
}

interface ViewportAcceptancePageProps {
  readonly searchParams: Promise<{ readonly repositories?: string }>;
}
