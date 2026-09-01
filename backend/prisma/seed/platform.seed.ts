// ─────────────────────────────────────────────────────────────────────────────
// Seed — platform baseline
// Everything here is tenant-independent and safe to run on any environment,
// including a production VPS: the feature registry, the declared platform
// settings, the default retention clocks and the standard report catalogue.
//
// The rule these four share is that code is the source of truth and the table is
// a projection of it. `FEATURE_SPECS`, `SETTING_SPECS` and `STANDARD_REPORTS`
// live in src/; this file only mirrors them so the admin panel can render
// descriptions without hard-coding them. Adding a feature means editing
// src/core/features/feature-keys.ts and running the seed again.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import { SETTING_SPECS } from '../../src/modules/platform/platform.constants';
import { syncFeatureDefinitions } from '../../src/modules/platform/platform.service';
import { STANDARD_REPORTS } from '../../src/modules/reporting/reporting.reports';
import { log, step } from './helpers';

/**
 * Starting values for the declared settings. Deliberately conservative:
 * self-registration is closed, the maintenance banner is empty, and no
 * credential reference is invented.
 */
const SETTING_DEFAULTS: Record<string, Prisma.InputJsonValue> = {
  'support.contactEmail': 'support@midasstudio.example',
  'support.escalationRota': 'Unassigned — set the on-call name in the admin panel.',
  'platform.maintenanceBanner': '',
  'platform.registrationOpen': false,
  'privacy.dataProtectionContact': 'privacy@midasstudio.example',
  'privacy.defaultRetentionDays': 1095,
  'commercial.defaultCurrency': 'GBP',
  'integrations.smtpCredentialRef': '',
};

/**
 * Blueprint 10 retention. Learner evidence is anonymised rather than deleted so
 * a school keeps its aggregate history; the audit trail outlives the learner
 * data it describes, because a retention action must itself be auditable.
 */
interface RetentionSpec {
  dataClass: string;
  retainMonths: number;
  action: 'ANONYMIZE' | 'DELETE' | 'ARCHIVE';
  notes: string;
}

const RETENTION_DEFAULTS: RetentionSpec[] = [
  {
    dataClass: 'student_responses',
    retainMonths: 36,
    action: 'ANONYMIZE',
    notes: 'Item-level answers. Anonymised so item quality analysis survives the learner leaving.',
  },
  {
    dataClass: 'assessment_attempts',
    retainMonths: 36,
    action: 'ANONYMIZE',
    notes: 'Attempt records including scores. Kept in aggregate, detached from the named learner.',
  },
  {
    dataClass: 'progress_records',
    retainMonths: 36,
    action: 'ANONYMIZE',
    notes: 'Time and completion per activity. Same clock as the responses they summarise.',
  },
  {
    dataClass: 'notifications',
    retainMonths: 12,
    action: 'DELETE',
    notes: 'Delivered messages have no evidential value once read.',
  },
  {
    dataClass: 'sessions',
    retainMonths: 2,
    action: 'DELETE',
    notes: 'Refresh-token rows. Expired sessions are cleared aggressively.',
  },
  {
    dataClass: 'report_exports',
    retainMonths: 3,
    action: 'DELETE',
    notes: 'Generated files. Re-run the report rather than keeping the artefact.',
  },
  {
    dataClass: 'support_requests',
    retainMonths: 24,
    action: 'ARCHIVE',
    notes: 'Kept for pattern analysis across schools; archived rather than removed.',
  },
  {
    dataClass: 'audit_logs',
    retainMonths: 84,
    action: 'ARCHIVE',
    notes: 'Seven years. The audit trail must outlive the records it explains.',
  },
];

export async function seedFeatureRegistry(): Promise<void> {
  step('Feature registry (blueprint 06)');
  const result = await syncFeatureDefinitions(null);
  log(
    `${result.created} added, ${result.updated} refreshed, ${result.retired.length} hidden as retired`,
  );
}

export async function seedPlatformSettings(): Promise<void> {
  step('Platform settings');
  let created = 0;
  for (const spec of SETTING_SPECS) {
    const value = SETTING_DEFAULTS[spec.key] ?? '';
    const existing = await prisma.platformSetting.findUnique({ where: { key: spec.key } });
    if (existing) {
      // The value belongs to whoever operates the platform. Re-seeding refreshes
      // the description and the secrecy flag, and never overwrites an edit.
      await prisma.platformSetting.update({
        where: { key: spec.key },
        data: { description: spec.description, isSecret: spec.isSecret },
      });
      continue;
    }
    await prisma.platformSetting.create({
      data: {
        key: spec.key,
        value,
        description: spec.description,
        isSecret: spec.isSecret,
      },
    });
    created += 1;
  }
  log(`${SETTING_SPECS.length} declared keys, ${created} newly created`);
}

export async function seedRetentionPolicies(): Promise<void> {
  step('Retention policies (blueprint 10)');
  for (const spec of RETENTION_DEFAULTS) {
    // `@@unique([schoolId, dataClass])` includes a nullable column, and Prisma
    // cannot express `null` inside a compound unique `where`. Platform defaults
    // are therefore located with findFirst and written by primary key.
    const existing = await prisma.retentionPolicy.findFirst({
      where: { schoolId: null, dataClass: spec.dataClass },
      select: { id: true },
    });
    if (existing) {
      await prisma.retentionPolicy.update({
        where: { id: existing.id },
        data: { retainMonths: spec.retainMonths, action: spec.action, notes: spec.notes },
      });
      continue;
    }
    await prisma.retentionPolicy.create({
      data: {
        schoolId: null,
        dataClass: spec.dataClass,
        retainMonths: spec.retainMonths,
        action: spec.action,
        notes: spec.notes,
        isActive: true,
      },
    });
  }
  log(`${RETENTION_DEFAULTS.length} platform defaults (a school may tighten any of them)`);
}

export async function seedReportCatalogue(): Promise<void> {
  step('Standard report catalogue (blueprint 04)');
  for (const spec of STANDARD_REPORTS) {
    const data = {
      name: spec.name,
      description: spec.description,
      scopeLevel: spec.scopeLevel,
      audience: spec.audience as unknown as Prisma.InputJsonValue,
      measureNotes: spec.measureNotes,
      limitationNotes: spec.limitationNotes,
      evidenceSources: spec.evidenceSources as unknown as Prisma.InputJsonValue,
      isSystem: true,
      isActive: true,
    };
    const existing = await prisma.reportDefinition.findFirst({
      where: { schoolId: null, key: spec.key },
      select: { id: true },
    });
    if (existing) {
      await prisma.reportDefinition.update({ where: { id: existing.id }, data });
      continue;
    }
    await prisma.reportDefinition.create({ data: { ...data, schoolId: null, key: spec.key } });
  }
  log(`${STANDARD_REPORTS.length} system reports available to every school`);
}
