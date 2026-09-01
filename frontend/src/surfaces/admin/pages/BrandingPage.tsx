import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  IconAdd,
  IconBranding,
  IconCheck,
  IconEdit,
  IconRollback,
  Input,
  Modal,
  PageHeader,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDateTime } from '@/lib/format';
import {
  activateTheme,
  archiveTheme,
  createTheme,
  fetchThemes,
  fetchThemeVersions,
  publishTheme,
  restoreTheme,
  rollbackTheme,
  updateTheme,
} from '@/theme/theme.api';
import type { ThemeRow, ThemeStatus } from '@/theme/theme.types';

const STATUS_TONE: Record<ThemeStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'info',
  ARCHIVED: 'danger',
};

/**
 * Every first-class colour column the backend accepts (`themeColours` in
 * `backend/src/modules/theme/theme.validation.ts`) — not just the three the
 * quick-create form started with, so nothing the API supports stays invisible.
 */
const COLOR_FIELDS = [
  { key: 'colorPrimary', label: 'Primary', fallback: '#0F766E' },
  { key: 'colorSecondary', label: 'Secondary', fallback: '#0EA5E9' },
  { key: 'colorAccent', label: 'Accent', fallback: '#F59E0B' },
  { key: 'colorSuccess', label: 'Success', fallback: '#16A34A' },
  { key: 'colorWarning', label: 'Warning', fallback: '#D97706' },
  { key: 'colorDanger', label: 'Danger', fallback: '#DC2626' },
  { key: 'colorSurface', label: 'Surface', fallback: '#FFFFFF' },
  { key: 'colorBackground', label: 'Background', fallback: '#F8FAFC' },
  { key: 'colorTextBody', label: 'Text', fallback: '#0F172A' },
  { key: 'colorTextMuted', label: 'Muted text', fallback: '#64748B' },
] as const;

/** School branding: the themes on file, which one is live, and their lifecycle actions. */
export function BrandingPage() {
  useDocumentTitle('Branding');
  const queryClient = useQueryClient();
  const canWrite = useCan('theme.write');
  const canPublish = useCan('theme.publish');

  const [createFrom, setCreateFrom] = useState<ThemeRow | null | undefined>(undefined);
  const [publishTarget, setPublishTarget] = useState<ThemeRow | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<ThemeRow | null>(null);
  const [editTarget, setEditTarget] = useState<ThemeRow | null>(null);

  const query = useQuery({ queryKey: qk.theme.list(), queryFn: () => fetchThemes() });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['theme'] });
  };

  const activate = useMutation({ mutationFn: (id: string) => activateTheme(id), onSuccess: invalidate });
  const archive = useMutation({ mutationFn: (id: string) => archiveTheme(id), onSuccess: invalidate });
  const restore = useMutation({ mutationFn: (id: string) => restoreTheme(id), onSuccess: invalidate });

  const themes = query.data?.items ?? [];
  const active = themes.find((t) => t.isActiveForSchool);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Branding"
        description="Your school's colours, and which theme is currently live."
        actions={
          canWrite ? (
            <Button leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setCreateFrom(null)}>
              New theme
            </Button>
          ) : undefined
        }
      />

      <Card className="border-primary-muted bg-primary-soft/40">
        <CardBody className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-strong"
            style={active ? { backgroundColor: active.theme.colorPrimary, color: active.theme.colorSurface } : undefined}
          >
            <IconBranding aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm text-ink-muted">Live theme</p>
            <p className="text-lg font-semibold text-ink">{active ? active.theme.name : 'Platform default'}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Themes" description="Draft, publish, activate and roll back your school's palettes." />
        <CardBody className="p-0">
          {(activate.error || archive.error || restore.error) ? (
            <ErrorState error={activate.error ?? archive.error ?? restore.error} className="m-4" />
          ) : null}
          <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
            {themes.length === 0 ? (
              <EmptyState
                icon={<IconBranding className="h-8 w-8" aria-hidden />}
                title="No themes yet"
                description="Create one to start customising colours."
                className="p-8"
              />
            ) : (
              <ul className="divide-y divide-line">
                {themes.map(({ theme, isEditable, isActiveForSchool, hasUnpublishedChanges }) => (
                  <li key={theme.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className="h-6 w-6 shrink-0 rounded-full border border-line"
                        style={{ backgroundColor: theme.colorPrimary }}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-ink">{theme.name}</p>
                          <Badge tone={STATUS_TONE[theme.status]}>{theme.status}</Badge>
                          {isActiveForSchool ? <Badge tone="success">Active</Badge> : null}
                          {!isEditable ? <Badge tone="neutral">Platform theme</Badge> : null}
                          {isEditable && hasUnpublishedChanges ? <Badge tone="warning">Unpublished changes</Badge> : null}
                        </div>
                        <p className="text-xs text-ink-muted">updated {formatDateTime(theme.updatedAt)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canWrite && isEditable && theme.status !== 'ARCHIVED' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          leadingIcon={<IconEdit aria-hidden className="h-4 w-4" />}
                          onClick={() => setEditTarget(theme)}
                        >
                          Edit
                        </Button>
                      ) : null}
                      {canWrite && !isEditable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />}
                          onClick={() => setCreateFrom(theme)}
                        >
                          Duplicate to customise
                        </Button>
                      ) : null}
                      {canPublish && isEditable && (theme.status === 'DRAFT' || hasUnpublishedChanges) ? (
                        <Button size="sm" variant="outline" onClick={() => setPublishTarget(theme)}>
                          Publish
                        </Button>
                      ) : null}
                      {canPublish && isEditable && theme.status === 'PUBLISHED' && !isActiveForSchool ? (
                        <Button
                          size="sm"
                          leadingIcon={<IconCheck aria-hidden className="h-4 w-4" />}
                          isLoading={activate.isPending && activate.variables === theme.id}
                          onClick={() => activate.mutate(theme.id)}
                        >
                          Activate
                        </Button>
                      ) : null}
                      {canPublish && isEditable && theme.status === 'PUBLISHED' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          leadingIcon={<IconRollback aria-hidden className="h-4 w-4" />}
                          onClick={() => setRollbackTarget(theme)}
                        >
                          Roll back
                        </Button>
                      ) : null}
                      {canWrite && isEditable && theme.status !== 'ARCHIVED' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          isLoading={archive.isPending && archive.variables === theme.id}
                          onClick={() => archive.mutate(theme.id)}
                        >
                          Archive
                        </Button>
                      ) : null}
                      {canWrite && theme.status === 'ARCHIVED' && theme.schoolId ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          isLoading={restore.isPending && restore.variables === theme.id}
                          onClick={() => restore.mutate(theme.id)}
                        >
                          Restore
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
        </CardBody>
      </Card>

      {createFrom !== undefined ? (
        <CreateThemeModal
          basedOn={createFrom}
          onClose={() => setCreateFrom(undefined)}
          onDone={() => {
            invalidate();
            setCreateFrom(undefined);
          }}
        />
      ) : null}

      {publishTarget ? (
        <PublishModal
          theme={publishTarget}
          onClose={() => setPublishTarget(null)}
          onDone={() => {
            invalidate();
            setPublishTarget(null);
          }}
        />
      ) : null}

      {rollbackTarget ? (
        <RollbackModal
          theme={rollbackTarget}
          onClose={() => setRollbackTarget(null)}
          onDone={() => {
            invalidate();
            setRollbackTarget(null);
          }}
        />
      ) : null}

      {editTarget ? (
        <EditThemeModal
          theme={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => {
            invalidate();
            setEditTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CreateThemeModal({
  basedOn,
  onClose,
  onDone,
}: {
  basedOn: ThemeRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(basedOn ? `Copy of ${basedOn.name}` : '');
  const [key, setKey] = useState('');
  const [colors, setColors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () =>
      createTheme(
        basedOn
          ? { name, key, basedOnThemeId: basedOn.id }
          : { name, key, ...colors },
      ),
    onSuccess: onDone,
  });

  return (
    <Modal isOpen onClose={onClose} title={basedOn ? `Duplicate "${basedOn.name}"` : 'New theme'}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        {create.error ? <ErrorState error={create.error} /> : null}
        <Field label="Name" isRequired>
          <Input required value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Key" isRequired hint="A short, url-safe identifier, e.g. autumn-leaves.">
          <Input required value={key} onChange={(event) => setKey(event.target.value)} />
        </Field>
        {basedOn ? (
          <p className="text-sm text-ink-muted">
            Every colour and setting is copied from "{basedOn.name}" — edit the copy afterwards from its own row.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {COLOR_FIELDS.map((color) => (
              <Field key={color.key} label={color.label}>
                <Input
                  type="color"
                  className="h-10 p-1"
                  value={colors[color.key] ?? color.fallback}
                  onChange={(event) =>
                    setColors((prev) => ({ ...prev, [color.key]: event.target.value }))
                  }
                />
              </Field>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={create.isPending}>
            Create draft
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PublishModal({
  theme,
  onClose,
  onDone,
}: {
  theme: ThemeRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [changeSummary, setChangeSummary] = useState('');
  const [activateNow, setActivateNow] = useState(true);

  const mutation = useMutation({
    mutationFn: () => publishTheme(theme.id, { changeSummary, activate: activateNow }),
    onSuccess: onDone,
  });

  return (
    <Modal isOpen onClose={onClose} title={`Publish "${theme.name}"`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="What changed" isRequired hint="Recorded on the version history.">
          <Textarea required minLength={3} value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={activateNow} onChange={(event) => setActivateNow(event.target.checked)} />
          Make this the school's live theme
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            Publish
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RollbackModal({
  theme,
  onClose,
  onDone,
}: {
  theme: ThemeRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const versions = useQuery({
    queryKey: qk.theme.versions(theme.id),
    queryFn: () => fetchThemeVersions(theme.id),
  });
  const [version, setVersion] = useState<number | null>(null);
  const [changeSummary, setChangeSummary] = useState('');

  const mutation = useMutation({
    mutationFn: () => rollbackTheme(theme.id, version ?? 1, changeSummary || undefined),
    onSuccess: onDone,
  });

  const rows = versions.data?.items ?? [];

  return (
    <Modal isOpen onClose={onClose} title={`Roll back "${theme.name}"`}>
      <QueryBoundary isLoading={versions.isPending} error={versions.error} onRetry={() => void versions.refetch()}>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">This theme has no published version history yet.</p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.error ? <ErrorState error={mutation.error} /> : null}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-ink">Version to restore</legend>
              {rows.map((row) => (
                <label key={row.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="version"
                    checked={version === row.version}
                    onChange={() => setVersion(row.version)}
                  />
                  v{row.version} — {row.changeSummary ?? 'No summary'} ·{' '}
                  {row.publishedAt ? formatDateTime(row.publishedAt) : 'unpublished'}
                </label>
              ))}
            </fieldset>
            <Field label="Reason (optional)">
              <Textarea value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={version === null} isLoading={mutation.isPending}>
                Roll back
              </Button>
            </div>
          </form>
        )}
      </QueryBoundary>
    </Modal>
  );
}

/**
 * The one thing the Branding screen was missing: an existing draft's colours
 * (and, since the backend accepts them too, its fonts) could be set at creation
 * but never changed afterwards. `updateTheme` (`PATCH /themes/:id`) already
 * worked — nothing called it.
 */
function EditThemeModal({
  theme,
  onClose,
  onDone,
}: {
  theme: ThemeRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [colors, setColors] = useState<Record<string, string>>(() =>
    Object.fromEntries(COLOR_FIELDS.map((field) => [field.key, theme[field.key]])),
  );
  const [fontHeading, setFontHeading] = useState(theme.fontHeading);
  const [fontBody, setFontBody] = useState(theme.fontBody);
  const [fontBaseSize, setFontBaseSize] = useState(theme.fontBaseSize);

  const mutation = useMutation({
    mutationFn: () =>
      updateTheme(theme.id, {
        ...colors,
        fontHeading,
        fontBody,
        fontBaseSize,
      }),
    onSuccess: onDone,
  });

  return (
    <Modal isOpen onClose={onClose} title={`Edit "${theme.name}"`} size="lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {mutation.error ? <ErrorState error={mutation.error} /> : null}

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Colours</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {COLOR_FIELDS.map((color) => (
              <Field key={color.key} label={color.label}>
                <Input
                  type="color"
                  className="h-10 p-1"
                  value={colors[color.key] ?? color.fallback}
                  onChange={(event) =>
                    setColors((prev) => ({ ...prev, [color.key]: event.target.value }))
                  }
                />
              </Field>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Heading font">
            <Input value={fontHeading} onChange={(event) => setFontHeading(event.target.value)} />
          </Field>
          <Field label="Body font">
            <Input value={fontBody} onChange={(event) => setFontBody(event.target.value)} />
          </Field>
          <Field label="Base size (px)">
            <Input
              type="number"
              min={12}
              max={24}
              value={fontBaseSize}
              onChange={(event) => setFontBaseSize(Number(event.target.value))}
            />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Preview</p>
          <div
            className="rounded-lg border border-line p-4"
            style={{ backgroundColor: colors.colorBackground, fontFamily: fontBody }}
          >
            <p
              className="text-lg font-semibold"
              style={{ color: colors.colorTextBody, fontFamily: fontHeading }}
            >
              Sample card title
            </p>
            <p className="mt-1 text-sm" style={{ color: colors.colorTextMuted }}>
              A quick line of muted body text, so you can judge the palette before saving.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className="rounded-md px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: colors.colorPrimary, color: colors.colorSurface }}
              >
                Primary
              </span>
              <span
                className="rounded-md px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: colors.colorSecondary, color: colors.colorSurface }}
              >
                Secondary
              </span>
              <span
                className="rounded-md px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: colors.colorAccent, color: colors.colorSurface }}
              >
                Accent
              </span>
              <span
                className="rounded-md px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: colors.colorDanger, color: colors.colorSurface }}
              >
                Danger
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
