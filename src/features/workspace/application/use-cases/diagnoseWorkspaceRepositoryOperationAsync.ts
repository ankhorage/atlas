import type { WorkspaceRepositoryFailureStage } from '@/types/workspace';

/*** Associate one repository-operation boundary with an opaque correlation identifier without exposing its cause. */
export async function diagnoseWorkspaceRepositoryOperationAsync<Result>(
  correlationId: string,
  stage: WorkspaceRepositoryFailureStage,
  operation: () => Promise<Result>
): Promise<Result> {
  try {
    return await operation();
  } catch (cause) {
    throw new WorkspaceRepositoryOperationError(correlationId, stage, cause);
  }
}

/*** Retain an original error only on the server so classification can discard unsafe provider detail. */
class WorkspaceRepositoryOperationError extends Error {
  public constructor(
    readonly correlationId: string,
    readonly stage: WorkspaceRepositoryFailureStage,
    readonly cause: unknown
  ) {
    super('Repository operation failed.');
    this.name = 'WorkspaceRepositoryOperationError';
  }
}

/*** Extract a known safe diagnostic envelope while keeping the original provider error internal. */
export function workspaceRepositoryOperationDiagnostic(error: unknown):
  | {
      readonly cause: unknown;
      readonly correlationId: string;
      readonly stage: WorkspaceRepositoryFailureStage;
    }
  | undefined {
  return error instanceof WorkspaceRepositoryOperationError
    ? { cause: error.cause, correlationId: error.correlationId, stage: error.stage }
    : undefined;
}
