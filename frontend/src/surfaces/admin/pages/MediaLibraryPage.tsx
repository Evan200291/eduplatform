import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Checkbox,
  EmptyState,
  Field,
  IconAdd,
  IconMedia,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { fetchAuthorizedBlob, saveBlob } from '@/api';
import {
  deleteMedia,
  fetchMedia,
  fetchMediaUsage,
  moderateMedia,
  restoreMedia,
  updateMedia,
  uploadMedia,
} from '@/content/content.api';
import type { ContentOwnership, MediaKind, MediaRecord, ModerationDecision } from '@/content/content.types';
import { qk } from '@/query/keys';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';

/**
 * The school's media library (blueprint 07 and 09).
 *
 * Three jobs: see what is stored and how much room it takes; make every file
 * usable — alt text for images, a transcript or captions for audio and video,
 * which blueprint 07 treats as a condition of storing them at all; and moderate
 * what staff upload before it reaches a child.
 */

const KIND_LABEL: Record<MediaKind, string> = {
  IMAGE: 'Image',
  AUDIO: 'Audio',
  VIDEO: 'Video',
  DOCUMENT: 'Document',
  ANIMATION: 'Animation',
  ARCHIVE: 'Archive',
};

const DECISION_LABEL: Record<ModerationDecision, string> = {
  PENDING: 'Awaiting review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ESCALATED: 'Escalated',
  REMOVED: 'Removed',
};

const DECISION_TONE = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  ESCALATED: 'info',
  REMOVED: 'neutral',
} as const;

const OWNERSHIP_LABEL: Record<ContentOwnership, string> = {
  MIDAS_ORIGINAL: 'Midas original',
  SCHOOL_OWNED: 'School owned',
  SCHOOL_LICENSED: 'Licensed to the school',
  THIRD_PARTY_LICENSED: 'Third-party licence',
  CO_CREATED: 'Co-created',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * What a file still needs before it is usable by every learner — the same
 * rule the server applies at upload (`assertMediaAccessibility`), checked here
 * for files stored before the rule existed.
 */
function accessibilityGaps(row: MediaRecord): string[] {
  if (row.kind === 'IMAGE' && !row.altText) return ['alt text'];
  if ((row.kind === 'AUDIO' || row.kind === 'VIDEO') && !row.transcript && !row.caption) {
    return ['a transcript or captions'];
  }
  return [];
}

export function MediaLibraryPage() {
  useDocumentTitle('Media library');
  const queryClient = useQueryClient();
  const canUpload = useCan('media.upload');
  const canModerate = useCan('media.moderate');
  const canDelete = useCan('media.delete');
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<MediaKind | ''>('');
  const [decision, setDecision] = useState<ModerationDecision | ''>('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [editing, setEditing] = useState<MediaRecord | null>(null);
  const [moderating, setModerating] = useState<MediaRecord | null>(null);
  const [isUploading, setUploading] = useState(false);

  const params = {
    page,
    pageSize: 20,
    includeDeleted,
    ...(kind ? { kind } : {}),
    ...(decision ? { moderationDecision: decision } : {}),
  };
  const query = useQuery({ queryKey: qk.media.list(params), queryFn: () => fetchMedia(params) });
  const usage = useQuery({ queryKey: qk.media.usage, queryFn: fetchMediaUsage });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.media.all });

  const remove = useMutation({ mutationFn: (id: string) => deleteMedia(id), onSuccess: refresh });
  const restore = useMutation({ mutationFn: (id: string) => restoreMedia(id), onSuccess: refresh });
  const download = useMutation({
    mutationFn: async (row: MediaRecord) => {
      const { blob } = await fetchAuthorizedBlob(`/media/${encodeURIComponent(row.id)}/file?disposition=attachment`);
      saveBlob(blob, row.fileName);
    },
  });

  const rows = query.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Media library"
        description="Every image, recording and document the school has uploaded — and what each still needs to be usable by every learner."
        actions={
          canUpload ? (
            <Button leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setUploading(true)}>
              Upload
            </Button>
          ) : undefined
        }
      />

      {usage.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <UsageTile label="Files" value={String(usage.data.assetCount)} />
          <UsageTile label="Space used" value={formatBytes(usage.data.recordedBytes)} />
          <UsageTile label="Largest upload allowed" value={formatBytes(usage.data.maxUploadBytes)} />
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="text-xs font-medium text-ink-muted">By kind</p>
            <ul className="mt-1 text-sm text-ink">
              {usage.data.byKind.length === 0 ? <li className="text-ink-muted">Nothing yet</li> : null}
              {usage.data.byKind.map((entry) => (
                <li key={entry.kind}>
                  {KIND_LABEL[entry.kind]}: {entry.assetCount} · {formatBytes(entry.bytes)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {usage.data && usage.data.storedBytes > usage.data.recordedBytes * 1.1 + 1024 * 1024 ? (
        <p className="text-sm text-ink-muted">
          Storage holds {formatBytes(usage.data.storedBytes - usage.data.recordedBytes)} more than the library lists —
          usually files left behind by failed uploads. Raise a support request to have them cleared.
        </p>
      ) : null}

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Kind">
            <Select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as MediaKind | '');
                setPage(1);
              }}
              options={[{ value: '', label: 'All kinds' }, ...(Object.keys(KIND_LABEL) as MediaKind[]).map((value) => ({ value, label: KIND_LABEL[value] }))]}
            />
          </Field>
          <Field label="Review">
            <Select
              value={decision}
              onChange={(event) => {
                setDecision(event.target.value as ModerationDecision | '');
                setPage(1);
              }}
              options={[
                { value: '', label: 'Any' },
                ...(Object.keys(DECISION_LABEL) as ModerationDecision[]).map((value) => ({ value, label: DECISION_LABEL[value] })),
              ]}
            />
          </Field>
          <div className="pb-2">
            <Checkbox
              label="Show deleted files"
              checked={includeDeleted}
              onChange={(event) => {
                setIncludeDeleted(event.target.checked);
                setPage(1);
              }}
            />
          </div>
        </CardBody>
      </Card>

      {remove.error ? <ErrorState error={remove.error} /> : null}
      {restore.error ? <ErrorState error={restore.error} /> : null}
      {download.error ? <ErrorState error={download.error} /> : null}

      <QueryBoundary
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={rows.length === 0}
        emptyState={
          <EmptyState
            icon={<IconMedia className="h-8 w-8" aria-hidden />}
            title="No files here"
            description={kind || decision ? 'No files match these filters.' : 'Uploaded images, audio and documents appear here.'}
          />
        }
      >
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const gaps = accessibilityGaps(row);
            const isDeleted = row.deletedAt !== null;
            const isLibrary = row.schoolId === null;
            return (
              <li key={row.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
                <div className="flex gap-3">
                  <MediaThumb row={row} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="truncate text-sm font-medium text-ink" title={row.fileName}>
                      {row.fileName}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {KIND_LABEL[row.kind]} · {formatBytes(row.byteSize)} · {formatDate(row.createdAt)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={DECISION_TONE[row.moderationDecision]}>{DECISION_LABEL[row.moderationDecision]}</Badge>
                      {isDeleted ? <Badge tone="neutral">Deleted</Badge> : null}
                      {isLibrary ? <Badge tone="info">Platform library</Badge> : null}
                      {row.isPublic ? <Badge tone="neutral">Public</Badge> : null}
                    </div>
                  </div>
                </div>
                {gaps.length > 0 && !isDeleted ? (
                  <p className="text-xs font-medium text-warning-strong">Needs {gaps.join(', ')}</p>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    isLoading={download.isPending && download.variables?.id === row.id}
                    onClick={() => download.mutate(row)}
                  >
                    Download
                  </Button>
                  {!isDeleted && !isLibrary && canUpload ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                      Details
                    </Button>
                  ) : null}
                  {!isDeleted && !isLibrary && canModerate ? (
                    <Button size="sm" variant="ghost" onClick={() => setModerating(row)}>
                      Review
                    </Button>
                  ) : null}
                  {!isLibrary && canDelete ? (
                    isDeleted ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={restore.isPending && restore.variables === row.id}
                        onClick={() => restore.mutate(row.id)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={remove.isPending && remove.variables === row.id}
                        onClick={() => remove.mutate(row.id)}
                      >
                        Delete
                      </Button>
                    )
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
      </QueryBoundary>

      {editing ? (
        <MediaDetailsModal
          row={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
      {moderating ? (
        <ModerateMediaModal
          row={moderating}
          onClose={() => setModerating(null)}
          onDone={() => {
            setModerating(null);
            refresh();
          }}
        />
      ) : null}
      {isUploading ? (
        <UploadModal
          onClose={() => setUploading(false)}
          onDone={() => {
            setUploading(false);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function UsageTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

/**
 * An image preview, fetched with the bearer token since the file route is
 * protected. Other kinds show their type instead of guessing at a thumbnail.
 */
function MediaThumb({ row }: { row: MediaRecord }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = row.kind === 'IMAGE' && row.deletedAt === null;

  useEffect(() => {
    if (!isImage) return;
    let revoked = false;
    let objectUrl: string | null = null;
    fetchAuthorizedBlob(`/media/${encodeURIComponent(row.id)}/file`)
      .then(({ blob }) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isImage, row.id]);

  return (
    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-sunken text-xs text-ink-muted">
      {isImage && url ? (
        <img src={url} alt={row.altText ?? ''} className="h-full w-full object-cover" />
      ) : (
        <span>{KIND_LABEL[row.kind]}</span>
      )}
    </div>
  );
}

function MediaDetailsModal({ row, onClose, onDone }: { row: MediaRecord; onClose: () => void; onDone: () => void }) {
  const [fileName, setFileName] = useState(row.fileName);
  const [altText, setAltText] = useState(row.altText ?? '');
  const [caption, setCaption] = useState(row.caption ?? '');
  const [transcript, setTranscript] = useState(row.transcript ?? '');
  const [ownership, setOwnership] = useState<ContentOwnership>(row.ownership);
  const [licenseNote, setLicenseNote] = useState(row.licenseNote ?? '');
  const [attribution, setAttribution] = useState(row.attribution ?? '');
  const [isPublic, setPublic] = useState(row.isPublic);

  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  const mutation = useMutation({
    mutationFn: () =>
      updateMedia(row.id, {
        fileName: fileName.trim(),
        altText: optional(altText),
        caption: optional(caption),
        transcript: optional(transcript),
        ownership,
        licenseNote: optional(licenseNote),
        attribution: optional(attribution),
        isPublic,
      }),
    onSuccess: onDone,
  });

  const isTimed = row.kind === 'AUDIO' || row.kind === 'VIDEO' || row.kind === 'ANIMATION';

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title="File details"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={!fileName.trim()} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="File name" isRequired>
          <Input value={fileName} onChange={(event) => setFileName(event.target.value)} />
        </Field>
        {row.kind === 'IMAGE' || row.kind === 'ANIMATION' ? (
          <Field label="Alt text" hint="What the image shows, for a learner who cannot see it. Required for images.">
            <Input value={altText} onChange={(event) => setAltText(event.target.value)} />
          </Field>
        ) : null}
        {isTimed ? (
          <>
            <Field label="Captions" hint="Short caption text shown with the media.">
              <Textarea rows={2} value={caption} onChange={(event) => setCaption(event.target.value)} />
            </Field>
            <Field label="Transcript" hint="Everything said, for a learner who cannot hear it.">
              <Textarea rows={6} value={transcript} onChange={(event) => setTranscript(event.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Caption">
            <Input value={caption} onChange={(event) => setCaption(event.target.value)} />
          </Field>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Ownership">
            <Select
              value={ownership}
              onChange={(event) => setOwnership(event.target.value as ContentOwnership)}
              options={(Object.keys(OWNERSHIP_LABEL) as ContentOwnership[]).map((value) => ({ value, label: OWNERSHIP_LABEL[value] }))}
            />
          </Field>
          <Field label="Attribution">
            <Input value={attribution} onChange={(event) => setAttribution(event.target.value)} placeholder="Photo: …" />
          </Field>
        </div>
        <Field label="Licence note">
          <Input value={licenseNote} onChange={(event) => setLicenseNote(event.target.value)} />
        </Field>
        <Checkbox
          label="Public"
          hint="Served without signing in — only for things like a school logo on the login page."
          checked={isPublic}
          onChange={(event) => setPublic(event.target.checked)}
        />
      </div>
    </Modal>
  );
}

function ModerateMediaModal({ row, onClose, onDone }: { row: MediaRecord; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState<ModerationDecision>(row.moderationDecision === 'PENDING' ? 'APPROVED' : row.moderationDecision);
  const [notes, setNotes] = useState('');
  const mutation = useMutation({
    mutationFn: () => moderateMedia(row.id, { decision, notes: notes.trim() || undefined }),
    onSuccess: onDone,
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Review “${row.fileName}”`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
            Record decision
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Decision">
          <Select
            value={decision}
            onChange={(event) => setDecision(event.target.value as ModerationDecision)}
            options={(['APPROVED', 'REJECTED', 'ESCALATED', 'REMOVED'] as ModerationDecision[]).map((value) => ({
              value,
              label: DECISION_LABEL[value],
            }))}
          />
        </Field>
        <Field label="Notes" hint="Kept with the decision.">
          <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [progress, setProgress] = useState(0);
  const isImage = file?.type.startsWith('image/') ?? false;
  const isTimed = (file?.type.startsWith('audio/') || file?.type.startsWith('video/')) ?? false;

  // Mirrors `assertMediaAccessibility`: an image needs alt text, audio and video
  // a transcript or captions, before the server will store them.
  const blockedReason = !file
    ? null
    : isImage && !altText.trim()
      ? 'Describe the image before uploading.'
      : isTimed && !transcript.trim()
        ? 'Add a transcript before uploading.'
        : null;

  const mutation = useMutation({
    mutationFn: () =>
      uploadMedia(
        file as File,
        { altText: altText.trim() || undefined, transcript: transcript.trim() || undefined },
        setProgress,
      ),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title="Upload a file"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            isLoading={mutation.isPending}
            loadingLabel={`Uploading ${progress}%`}
            disabled={!file || blockedReason !== null}
            onClick={() => mutation.mutate()}
          >
            Upload
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="File" isRequired>
          <input
            type="file"
            className="text-sm text-ink"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
        {isImage ? (
          <Field label="Alt text" isRequired hint="What the image shows, for a learner who cannot see it.">
            <Input value={altText} onChange={(event) => setAltText(event.target.value)} />
          </Field>
        ) : null}
        {isTimed ? (
          <Field label="Transcript" isRequired hint="Everything said, for a learner who cannot hear it.">
            <Textarea rows={5} value={transcript} onChange={(event) => setTranscript(event.target.value)} />
          </Field>
        ) : null}
        {blockedReason ? <p className="text-sm text-ink-muted">{blockedReason}</p> : null}
      </div>
    </Modal>
  );
}
