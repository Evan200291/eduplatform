import type { AxiosRequestConfig } from 'axios';
import { http } from './http';
import { toApiError } from './error';
import type { ApiEnvelope, PageMeta, Paginated } from './types';

/**
 * Thin typed wrappers that unwrap the `{ data, meta }` envelope so callers work
 * with plain domain objects. Every rejection is already an `ApiError` (the
 * response interceptor normalises it); the extra `toApiError` here covers the
 * request-construction path.
 */

async function send<T>(config: AxiosRequestConfig): Promise<ApiEnvelope<T>> {
  try {
    const response = await http.request<ApiEnvelope<T>>(config);
    // 204 responses have no body; callers of `apiDelete` ignore the value.
    return (response.data ?? { data: undefined as T }) as ApiEnvelope<T>;
  } catch (cause) {
    throw toApiError(cause);
  }
}

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return (await send<T>({ ...config, method: 'GET', url })).data;
}

/** For endpoints whose `meta` carries something the caller needs (e.g. tenant). */
export async function apiGetWithMeta<T, M>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<{ data: T; meta: M | undefined }> {
  const envelope = await send<T>({ ...config, method: 'GET', url });
  return { data: envelope.data, meta: envelope.meta as M | undefined };
}

/**
 * Paginated lists: returns items plus the standard page meta.
 *
 * `params` takes any plain object rather than `Record<string, unknown>` —
 * every domain module has its own named query-param interface (extending
 * `ListQuery`), and none of those satisfy an index signature structurally.
 */
export async function apiGetPaged<T>(
  url: string,
  params?: object,
  config?: AxiosRequestConfig,
): Promise<Paginated<T>> {
  const response = await http
    .request<ApiEnvelope<T[], PageMeta>>({ ...config, method: 'GET', url, params })
    .catch((cause: unknown) => {
      throw toApiError(cause);
    });

  const items = response.data.data ?? [];
  const meta = response.data.meta ?? {
    page: 1,
    pageSize: items.length,
    totalItems: items.length,
    totalPages: 1,
    hasNextPage: false,
  };
  return { items, meta };
}

export async function apiPost<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  return (await send<T>({ ...config, method: 'POST', url, data })).data;
}

export async function apiPatch<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  return (await send<T>({ ...config, method: 'PATCH', url, data })).data;
}

export async function apiPut<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  return (await send<T>({ ...config, method: 'PUT', url, data })).data;
}

/** DELETE endpoints answer 204; nothing to unwrap. */
export async function apiDelete(url: string, config?: AxiosRequestConfig): Promise<void> {
  await send<void>({ ...config, method: 'DELETE', url });
}

/** Multipart upload helper for the media module. */
export async function apiUpload<T>(
  url: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return (
    await send<T>({
      method: 'POST',
      url,
      data: form,
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      },
    })
  ).data;
}
