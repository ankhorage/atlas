'use client';
import { Button } from '@zora/button';
import { View } from '@zora/view';

import { downloadAuditJsonAction, downloadAuditXmlAction } from '@/app/actions/audit.actions';

/*** Renders audit-export actions with generated ZORA buttons. */
export function AuditExportPanel({ source }: AuditExportPanelProps) {
  return (
    <View gap="s" p="m">
      <ExportButton
        format="JSON"
        mimeType="application/json"
        onExport={() => downloadAuditJsonAction(source)}
      />
      <ExportButton
        format="XML"
        mimeType="application/xml"
        onExport={() => downloadAuditXmlAction(source)}
      />
    </View>
  );
}

/*** Downloads one serialized audit format from a ZORA action button. */
function ExportButton({ format, mimeType, onExport }: ExportButtonProps) {
  return (
    <Button
      fullWidth
      leadingIcon={{ name: 'download-outline' }}
      size="s"
      variant="ghost"
      onPress={async () => {
        const { data, filename } = await onExport();
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }}
    >
      {format}
    </Button>
  );
}

interface ExportButtonProps {
  readonly format: string;
  readonly mimeType: string;
  readonly onExport: () => Promise<{ data: string; filename: string }>;
}

interface AuditExportPanelProps {
  readonly source?: string;
}
