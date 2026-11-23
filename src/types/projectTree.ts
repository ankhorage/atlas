import type { SourceFeatureMember } from '@ankhorage/dependency-graph';

/** Canonical analyzer evidence that identifies one feature component or module. */
interface ProjectTreeSourceEvidence {
  readonly analyzerId: SourceFeatureMember['analyzerId'];
  readonly filePath: SourceFeatureMember['filePath'];
  readonly location: SourceFeatureMember['evidence'];
}

export interface ProjectTreeNode {
  readonly children?: readonly ProjectTreeNode[];
  readonly graphPackage: string;
  readonly id: string;
  readonly kind: 'directory' | 'file' | 'virtual';
  readonly label: string;
  /** Present only for feature members that the analyzer proved at this source location. */
  readonly sourceEvidence?: ProjectTreeSourceEvidence;
  /** Marks an analyzer capability or ownership gap without manufacturing feature evidence. */
  readonly unavailable?: true;
}
