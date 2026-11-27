import type { WorkspaceRepositoryOption } from '@/features/workspace/composition/loadWorkspaceProjectSourceAsync';
import type { SettingsContextValue } from '@/types/settings';
import type { WorkspaceDefinition } from '@/types/workspace';

export interface WorkspaceControlsProps {
  readonly activeWorkspaceId?: string;
  readonly branchSelections: Readonly<Record<string, string>>;
  readonly onDeleteWorkspace: () => void;
  readonly onOpenWorkspace: (detail: WorkspaceOpenDetail) => void;
  readonly repositories?: readonly WorkspaceRepositoryOption[];
  readonly selectedIds: ReadonlySet<string>;
  readonly settings: SettingsContextValue;
  readonly source: string;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export interface WorkspaceMenuProps {
  readonly activeWorkspaceId?: string;
  readonly definitions: readonly WorkspaceDefinition[];
  readonly isDirty: boolean;
  readonly onDelete: () => void;
  readonly onOpen: (workspace: WorkspaceDefinition) => void;
  readonly onRename: () => void;
  readonly onSave: (saveAs: boolean) => void;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export interface WorkspaceOpenDetail {
  readonly branchSelections: Readonly<Record<string, string>>;
  readonly excludedRepositoryIds: readonly string[];
  readonly href: string;
  readonly id: string;
  readonly source: string;
}
