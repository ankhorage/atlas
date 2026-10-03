'use server';
import { js2xml } from 'xml-js';

import { createProjectSourceAuditAsync } from '@/features/project-source/composition/createProjectSourceAuditAsync';
import type { Audit } from '@/types/audit';

/*** Builds the audit payload for the configured project. */
export async function getAuditAction(source?: string): Promise<Audit> {
  return await createProjectSourceAuditAsync(source);
}

/*** Serializes the current project audit as JSON. */
export async function downloadAuditJsonAction(
  source?: string
): Promise<{ data: string; filename: string }> {
  const audit = await getAuditAction(source);
  const jsonString = JSON.stringify(audit, null, 2);
  const filename = 'audit.json';

  return { data: jsonString, filename };
}

/*** Serializes the current project audit as XML. */
export async function downloadAuditXmlAction(
  source?: string
): Promise<{ data: string; filename: string }> {
  const audit = await getAuditAction(source);
  const xmlString = js2xml({ audit }, { compact: true, spaces: 2 });
  const filename = `socomo-${audit.meta.timeEnd}-${audit.meta.projectName}-audit.xml`;

  return { data: xmlString, filename };
}
