import { OFFLINE_REPORT_RUNTIME_PART_1 } from '@/features/offline-report/constants/offlineReportRuntimePart1';
import { OFFLINE_REPORT_RUNTIME_PART_2 } from '@/features/offline-report/constants/offlineReportRuntimePart2';
import { OFFLINE_REPORT_RUNTIME_PART_3 } from '@/features/offline-report/constants/offlineReportRuntimePart3';

/** Compose the static browser runtime without changing its generated JavaScript bytes. */
export const OFFLINE_REPORT_RUNTIME = [
  OFFLINE_REPORT_RUNTIME_PART_1,
  OFFLINE_REPORT_RUNTIME_PART_2,
  OFFLINE_REPORT_RUNTIME_PART_3,
].join('\n');
