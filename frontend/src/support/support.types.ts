import type { ListQuery } from '@/api/types';

/** Mirrors `backend/src/modules/support` — requests, messages and the policy catalogue. */

export type SupportCategory =
  | 'ACCESS_ACCOUNT'
  | 'USABILITY'
  | 'CONTENT_ERROR'
  | 'CONFIGURATION_REQUEST'
  | 'DATA_REPORTING'
  | 'PLATFORM_DEFECT'
  | 'SECURITY_PRIVACY'
  | 'COMMERCIAL_SUBSCRIPTION';

export type SupportPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type SupportStatus =
  | 'NEW'
  | 'TRIAGED'
  | 'IN_PROGRESS'
  | 'WAITING_ON_CUSTOMER'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED';

export interface SupportPersonRef {
  id: string;
  displayName: string;
  email?: string | null;
}

export interface SupportRequestRow {
  id: string;
  /** Short human reference shown to the requester, e.g. "MID-1042". */
  reference: string;
  schoolId: string | null;
  requesterId: string;
  requester: SupportPersonRef | null;
  assigneeId: string | null;
  assignee: SupportPersonRef | null;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportStatus;
  subject: string;
  description: string;
  contextPath: string | null;
  /** Blueprint §13 response targets, stored so a breach is measurable. */
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionNote: string | null;
  defectReference: string | null;
  escalatedAt: string | null;
  escalatedToId: string | null;
  satisfactionScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessageRow {
  id: string;
  requestId: string;
  authorId: string | null;
  author: SupportPersonRef | null;
  body: string;
  /** Never shown to the requester; only an agent may write one. */
  isInternal: boolean;
  createdAt: string;
}

export interface SupportRequestDetail extends SupportRequestRow {
  messages: SupportMessageRow[];
}

/** One category's handling rules — owner, priority floor and response targets. */
export interface SupportPolicyEntry {
  category: SupportCategory;
  label?: string;
  owner?: string;
  minimumPriority?: SupportPriority;
  firstResponseHours?: number;
  resolutionHours?: number;
  escalationRoute?: string;
}

export interface SupportSummary {
  byStatus: { status: SupportStatus; count: number }[];
  byPriority: { priority: SupportPriority; count: number }[];
  unassigned: number;
  breaching?: number;
  open?: number;
}

export interface SupportListQuery extends ListQuery {
  status?: SupportStatus;
  category?: SupportCategory;
  priority?: SupportPriority;
  assigneeId?: string;
  requesterId?: string;
  unassigned?: boolean;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}
