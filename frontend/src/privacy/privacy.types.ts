import type { ListQuery } from '@/api/types';

/**
 * Mirrors `backend/src/modules/privacy` — audit trail, consent, retention,
 * data-subject requests. Deliberately append-only: no delete route anywhere
 * in this domain.
 */

export type LawfulBasis =
  | 'CONSENT'
  | 'CONTRACT'
  | 'LEGAL_OBLIGATION'
  | 'PUBLIC_TASK'
  | 'LEGITIMATE_INTEREST'
  | 'VITAL_INTERESTS';

export type RetentionAction = 'DELETE' | 'ANONYMIZE' | 'ARCHIVE';

// ── Data subject rights ──────────────────────────────────────────────────────

export type DataRequestKind = 'EXPORT' | 'DELETION' | 'CORRECTION';
export type DataRequestStatus =
  | 'REQUESTED'
  | 'IN_REVIEW'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

interface PersonRef {
  id: string;
  displayName: string;
  primaryRole: string;
}

export interface DataRequestRow {
  id: string;
  schoolId: string;
  kind: DataRequestKind;
  status: DataRequestStatus;
  details: string | null;
  dueAt: string;
  ownerUserId: string | null;
  exportStorageKey: string | null;
  outcomeNote: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  subjectUser: PersonRef;
  requestedBy: PersonRef;
}

export interface DataRequestListQuery extends ListQuery {
  status?: DataRequestStatus;
  kind?: DataRequestKind;
  subjectUserId?: string;
  openOnly?: boolean;
  overdueOnly?: boolean;
}

export interface DataRequestSummary {
  open: number;
  overdue: number;
  closedLast90Days: number;
  medianDaysToClose: number | null;
  byKind: Array<{ kind: DataRequestKind; open: number }>;
}

// ── Consent and lawful basis ────────────────────────────────────────────────

export interface ProcessingPurpose {
  purpose: string;
  label: string;
  description: string;
  suggestedBasis: LawfulBasis;
  optional: boolean;
}

export interface ConsentRow {
  id: string;
  schoolId: string;
  userId: string | null;
  purpose: string;
  lawfulBasis: LawfulBasis;
  granted: boolean;
  confirmedById: string | null;
  evidenceNote: string | null;
  policyVersion: string | null;
  effectiveFrom: string;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentListQuery extends ListQuery {
  purpose?: string;
  userId?: string;
  schoolLevelOnly?: boolean;
  activeOnly?: boolean;
}

export interface ConsentRegisterEntry extends ProcessingPurpose {
  recorded: { basis: LawfulBasis | null; granted: boolean | null; recordedAt: string | null };
  learnerOverrides: number;
}

// ── Retention ────────────────────────────────────────────────────────────────

export interface RetentionClassOption {
  dataClass: string;
  label: string;
  description: string;
  clock: string;
  supports: RetentionAction[];
  defaultRetainMonths: number;
  defaultAction: RetentionAction;
}

export interface RetentionPolicyRow {
  id: string;
  schoolId: string | null;
  dataClass: string;
  retainMonths: number;
  action: RetentionAction;
  isActive: boolean;
  notes: string | null;
  lastRunAt: string | null;
  lastRunRowCount: number | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  handler: {
    known: boolean;
    label: string | null;
    clock: string | null;
    supports: RetentionAction[];
    warning: string | null;
  };
}

export interface RetentionListQuery extends ListQuery {
  includePlatformDefaults?: boolean;
  activeOnly?: boolean;
}

export interface RetentionRunOutcome {
  policyId: string;
  schoolId: string | null;
  dataClass: string;
  action: string;
  cutoff: string;
  rowsAffected: number;
  skippedReason: string | null;
}

// ── Audit trail ──────────────────────────────────────────────────────────────

export interface AuditListRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  result: 'SUCCESS' | 'FAILURE' | 'DENIED';
  reason: string | null;
  actorRole: string | null;
  isImpersonation: boolean;
  occurredAt: string;
  actor: PersonRef | null;
}

export interface AuditDetailRow extends AuditListRow {
  organizationId: string | null;
  schoolId: string | null;
  beforeData: unknown;
  afterData: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface AuditListQuery extends ListQuery {
  action?: string;
  targetType?: string;
  targetId?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  problemsOnly?: boolean;
}

export interface AuditSummary {
  window: { from: string; to: string; days: number };
  total: number;
  denied: number;
  failed: number;
  impersonated: number;
  topActions: Array<{ action: string; count: number }>;
  busiestActors: Array<{ actorUserId: string; displayName: string; count: number }>;
}
