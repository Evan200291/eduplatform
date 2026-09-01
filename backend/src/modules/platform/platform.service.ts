// ─────────────────────────────────────────────────────────────────────────────
// Feature registry and platform settings (blueprint 06)
// The blueprint's rule is that "nothing can be toggled that is not first
// declared", and the declaration that matters is `FEATURE_SPECS` in
// src/core/features/feature-keys.ts — the resolver reads that file, not this
// table. So `FeatureDefinition` is a projection of code into the database, kept
// current by `syncFeatureDefinitions`, and only its presentation fields are
// editable. Anything else would let the admin panel promise a toggle the engine
// refuses to honour.
//
// Settings are the opposite shape: values that genuinely live in the database.
// Secret ones are redacted on the way out, for everyone, every time.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';
import { prisma } from '../../core/prisma';
import type { ActorContext } from '../../core/context';
import { recordAudit } from '../../core/audit/audit.service';
import { badRequest, notFound } from '../../core/http/errors';
import { FEATURE_SPECS, featureSpec } from '../../core/features/feature-keys';
import type { FeatureSpec } from '../../core/features/feature-keys';
import { invalidateFeatureCache } from '../../core/features/feature.service';
import { REDACTED, isKnownSettingKey, settingSpec, SETTING_SPECS } from './platform.constants';
import type {
  featureDefinitionQuery,
  settingListQuery,
  settingWriteSchema,
  updateFeatureDefinitionSchema,
} from './platform.validation';
import type { z } from 'zod';

type FeatureQuery = z.infer<typeof featureDefinitionQuery>;
type FeatureUpdate = z.infer<typeof updateFeatureDefinitionSchema>;
type SettingQuery = z.infer<typeof settingListQuery>;
type SettingWrite = z.infer<typeof settingWriteSchema>;

// ── Feature definitions ─────────────────────────────────────────────────────

export const DEFINITION_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  category: true,
  defaultEnabled: true,
  isSafetyRule: true,
  configurableScopes: true,
  includedInPlans: true,
  dependsOn: true,
  isVisible: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FeatureDefinitionSelect;

export type DefinitionRow = Prisma.FeatureDefinitionGetPayload<{ select: typeof DEFINITION_SELECT }>;

export interface SyncResult {
  created: number;
  updated: number;
  /** Rows in the table with no matching spec in code. Hidden, never deleted. */
  retired: string[];
}

function specData(spec: FeatureSpec, sortOrder: number): Prisma.FeatureDefinitionUncheckedCreateInput {
  return {
    key: spec.key,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    defaultEnabled: spec.defaultEnabled,
    isSafetyRule: spec.isSafetyRule ?? false,
    configurableScopes: spec.configurableScopes,
    includedInPlans:
      spec.includedInPlans === undefined
        ? Prisma.DbNull
        : (spec.includedInPlans),
    dependsOn:
      spec.dependsOn === undefined
        ? Prisma.DbNull
        : (spec.dependsOn),
    sortOrder,
  };
}

/**
 * Mirrors the code registry into the table. Idempotent, so the seed script and
 * an operator pressing "resync" do the same thing. A definition that no longer
 * exists in code is hidden rather than deleted: entitlement rows may still
 * reference it, and an audit trail that points at a vanished key is unreadable.
 */
export async function syncFeatureDefinitions(context: ActorContext | null): Promise<SyncResult> {
  const existing = await prisma.featureDefinition.findMany({
    select: { id: true, key: true, name: true, isVisible: true },
  });
  const byKey = new Map(existing.map((row) => [row.key, row]));

  let created = 0;
  let updated = 0;

  for (const [index, spec] of FEATURE_SPECS.entries()) {
    const data = specData(spec, index * 10);
    const current = byKey.get(spec.key);
    if (current) {
      // `name` and `sortOrder` may have been edited in the panel; the fields the
      // resolver depends on are overwritten from code regardless.
      await prisma.featureDefinition.update({
        where: { key: spec.key },
        data: {
          description: data.description,
          category: data.category,
          defaultEnabled: data.defaultEnabled,
          isSafetyRule: data.isSafetyRule,
          configurableScopes: data.configurableScopes,
          includedInPlans: data.includedInPlans,
          dependsOn: data.dependsOn,
        },
      });
      updated += 1;
    } else {
      await prisma.featureDefinition.create({ data });
      created += 1;
    }
  }

  const specKeys = new Set(FEATURE_SPECS.map((spec) => spec.key));
  const retired = existing.filter((row) => !specKeys.has(row.key));
  for (const row of retired) {
    if (row.isVisible) {
      await prisma.featureDefinition.update({ where: { id: row.id }, data: { isVisible: false } });
    }
  }

  if (context) {
    recordAudit(context, {
      action: 'platform.feature.update',
      targetType: 'FeatureDefinition',
      summary: `Feature registry resynced: ${created} added, ${updated} refreshed, ${retired.length} retired`,
      afterData: { created, updated, retired: retired.map((row) => row.key) },
    });
  }

  return { created, updated, retired: retired.map((row) => row.key) };
}

export interface DefinitionView extends DefinitionRow {
  /** False when the table holds a key that code no longer declares. */
  declaredInCode: boolean;
}

export async function listFeatureDefinitions(query: FeatureQuery): Promise<DefinitionView[]> {
  const where: Prisma.FeatureDefinitionWhereInput = {};
  if (query.category) where.category = query.category;
  if (!query.includeHidden) where.isVisible = true;

  const rows = await prisma.featureDefinition.findMany({
    where,
    select: DEFINITION_SELECT,
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
  });

  // Plan and scope filters are applied against the code registry rather than the
  // JSON columns: MySQL JSON containment is awkward to express through Prisma,
  // and code is the authority for both answers anyway.
  return rows
    .filter((row) => {
      const spec = featureSpec(row.key);
      if (query.plan && spec) {
        const included = spec.includedInPlans;
        if (included && !included.includes(query.plan)) return false;
      }
      if (query.scope && spec) {
        if (!spec.configurableScopes.includes(query.scope)) return false;
      }
      if ((query.plan || query.scope) && !spec) return false;
      return true;
    })
    .map((row) => ({ ...row, declaredInCode: featureSpec(row.key) !== undefined }));
}

export async function getFeatureDefinition(key: string): Promise<DefinitionView> {
  const row = await prisma.featureDefinition.findUnique({
    where: { key },
    select: DEFINITION_SELECT,
  });
  if (!row) throw notFound('That feature is not in the registry.');
  return { ...row, declaredInCode: featureSpec(row.key) !== undefined };
}

/**
 * Editing presentation only. Hiding a key is the supported way to retire a
 * feature from the panel, and it deliberately does not change the resolver's
 * answer — an entitlement already granted keeps working until it is removed.
 */
export async function updateFeatureDefinition(
  context: ActorContext,
  key: string,
  input: FeatureUpdate,
): Promise<DefinitionView> {
  const before = await getFeatureDefinition(key);

  const row = await prisma.featureDefinition.update({
    where: { key },
    data: {
      name: input.name ?? undefined,
      description: input.description ?? undefined,
      category: input.category ?? undefined,
      isVisible: input.isVisible ?? undefined,
      sortOrder: input.sortOrder ?? undefined,
    },
    select: DEFINITION_SELECT,
  });

  recordAudit(context, {
    action: 'platform.feature.update',
    targetType: 'FeatureDefinition',
    targetId: row.id,
    summary: `Feature ${key} updated`,
    beforeData: { name: before.name, isVisible: before.isVisible, sortOrder: before.sortOrder },
    afterData: { name: row.name, isVisible: row.isVisible, sortOrder: row.sortOrder },
  });

  return { ...row, declaredInCode: featureSpec(row.key) !== undefined };
}

// ── Settings ────────────────────────────────────────────────────────────────

export const SETTING_SELECT = {
  id: true,
  key: true,
  value: true,
  description: true,
  isSecret: true,
  createdAt: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.PlatformSettingSelect;

export type SettingRow = Prisma.PlatformSettingGetPayload<{ select: typeof SETTING_SELECT }>;

export interface SettingView extends Omit<SettingRow, 'value'> {
  value: Prisma.JsonValue | typeof REDACTED;
  /** False when the key is stored but nothing in code reads it. */
  declaredInCode: boolean;
  isRedacted: boolean;
}

/**
 * A secret is redacted for everyone, including platform staff. Reading a stored
 * credential back through an admin API is not a feature; replacing it is.
 */
function toView(row: SettingRow): SettingView {
  const { value, ...rest } = row;
  return {
    ...rest,
    value: row.isSecret ? REDACTED : value,
    declaredInCode: isKnownSettingKey(row.key),
    isRedacted: row.isSecret,
  };
}

export async function listSettings(query: SettingQuery): Promise<SettingView[]> {
  const rows = await prisma.platformSetting.findMany({
    select: SETTING_SELECT,
    orderBy: { key: 'asc' },
  });
  const views = rows.map(toView);
  return query.knownOnly ? views.filter((view) => view.declaredInCode) : views;
}

/** The declared keys, so the panel can show a setting that has never been set. */
export function settingCatalogue() {
  return SETTING_SPECS.map((spec) => ({ ...spec }));
}

export async function getSetting(key: string): Promise<SettingView> {
  const row = await prisma.platformSetting.findUnique({ where: { key }, select: SETTING_SELECT });
  if (!row) throw notFound('That setting has not been set.');
  return toView(row);
}

/**
 * Reads a setting's raw value for internal use. Not exposed through any route:
 * this is how server code consumes a secret without it passing through a
 * response body.
 */
export async function settingValue(key: string): Promise<Prisma.JsonValue | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key }, select: { value: true } });
  return row?.value ?? null;
}

export async function upsertSetting(
  context: ActorContext,
  input: SettingWrite,
): Promise<SettingView> {
  const spec = settingSpec(input.key);
  if (!spec && input.key.length > 120) {
    throw badRequest('That setting key is too long.');
  }

  const existing = await prisma.platformSetting.findUnique({
    where: { key: input.key },
    select: SETTING_SELECT,
  });

  // A declared key carries its own secrecy: the panel cannot un-redact a
  // credential by passing isSecret: false.
  const isSecret = spec ? spec.isSecret : (input.isSecret ?? existing?.isSecret ?? false);

  const row = await prisma.platformSetting.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      value: input.value as Prisma.InputJsonValue,
      description: input.description ?? spec?.description ?? null,
      isSecret,
      updatedById: context.actor.userId,
    },
    update: {
      value: input.value as Prisma.InputJsonValue,
      description: input.description ?? existing?.description ?? spec?.description ?? null,
      isSecret,
      updatedById: context.actor.userId,
    },
    select: SETTING_SELECT,
  });

  // Some settings feed feature resolution defaults; clearing the cache costs one
  // recomputation and avoids half an hour of stale behaviour.
  invalidateFeatureCache();

  recordAudit(context, {
    action: 'platform.settings.update',
    targetType: 'PlatformSetting',
    targetId: row.id,
    summary: `Setting ${input.key} updated`,
    // The value is never logged for a secret; the fact of the change is enough.
    afterData: isSecret ? { key: input.key, changed: true } : { key: input.key, value: row.value },
  });

  return toView(row);
}

export async function deleteSetting(context: ActorContext, key: string): Promise<void> {
  const row = await prisma.platformSetting.findUnique({ where: { key }, select: { id: true } });
  if (!row) throw notFound('That setting has not been set.');

  await prisma.platformSetting.delete({ where: { key } });
  invalidateFeatureCache();

  recordAudit(context, {
    action: 'platform.settings.update',
    targetType: 'PlatformSetting',
    targetId: row.id,
    summary: `Setting ${key} removed`,
    beforeData: { key },
  });
}
