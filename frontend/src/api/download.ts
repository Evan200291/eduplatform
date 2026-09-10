import { env } from '@/lib/env';
import { session } from './session';

/**
 * Fetches a file route — one that answers with bytes rather than the JSON
 * envelope — with the in-memory bearer token. A plain `<a href>` or `<img src>`
 * cannot send that header, so protected files are fetched as a blob instead.
 */
export async function fetchAuthorizedBlob(path: string): Promise<{ blob: Blob; fileName: string | null }> {
  const token = session.getAccessToken();
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Could not fetch the file (${response.status}).`);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  return { blob: await response.blob(), fileName: match?.[1] ?? null };
}

/** Hands a blob to the browser as a download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
