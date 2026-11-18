import { IconButton } from '@ankhorage/zora/web/icon-button';

import styles from './WorkspaceHeader.module.css';

/*** Renders a dialog title with an explicit, accessible ZORA close action. */
export function WorkspaceDialogTitle({ label, onDismiss, title }: WorkspaceDialogTitleProps) {
  return (
    <span className={styles.dialogTitle}>
      <span>{title}</span>
      <IconButton
        icon={{ name: 'close-outline' }}
        label={label}
        size="m"
        variant="ghost"
        onPress={onDismiss}
      />
    </span>
  );
}

interface WorkspaceDialogTitleProps {
  readonly label: string;
  readonly onDismiss: () => void;
  readonly title: string;
}
