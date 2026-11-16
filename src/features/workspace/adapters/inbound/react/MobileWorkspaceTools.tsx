'use client';
import { Dialog } from '@ankhorage/zora/web/dialog';

import type { WorkspacePanelsProps } from '@/features/workspace/adapters/inbound/react/WorkspacePanels';
import { WorkspaceSidebar } from '@/features/workspace/adapters/inbound/react/WorkspaceSidebar';

/*** Presents the existing workspace tools without mounting a second graph or navigation state. */
export function MobileWorkspaceTools({
  activeTool,
  open,
  workspacePanels,
  onDismiss,
  onToolChange,
}: MobileWorkspaceToolsProps) {
  return (
    <Dialog
      closeOnBackdrop
      description="Inspect the project tree, rules, exports, and graph settings without leaving the graph."
      title="Workspace tools"
      visible={open}
      width="wide"
      onDismiss={onDismiss}
    >
      <WorkspaceSidebar
        {...workspacePanels}
        activeTool={activeTool}
        inspectedCycleId={workspacePanels.cycleInspection.inspection?.id ?? null}
        mobile
        projectTree={workspacePanels.navigation.projectTree}
        selectedTreeIds={workspacePanels.navigation.selectedTreeIds}
        onCycleInspectionChange={workspacePanels.cycleInspection.change}
        onProjectTreeSelect={workspacePanels.navigation.selectProjectTreeNode}
        onToolChange={onToolChange}
      />
    </Dialog>
  );
}

interface MobileWorkspaceToolsProps {
  readonly activeTool: string;
  readonly open: boolean;
  readonly workspacePanels: WorkspacePanelsProps;
  readonly onDismiss: () => void;
  readonly onToolChange: (value: string) => void;
}
