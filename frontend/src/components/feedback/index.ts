/**
 * Feedback primitives: how the app tells the user something is happening, went
 * wrong, or is empty.
 *
 * The split is deliberate:
 *  - `ErrorState` handles *expected* failures (a request returned an error code).
 *  - `ErrorBoundary` handles *unexpected* ones (a component threw while rendering).
 *  - `QueryBoundary` sequences loading / error / empty / success so screens don't.
 *
 * All user-facing error wording lives in `error-messages.ts`, keyed by the
 * backend's stable `code`. Adding a new error code means one entry there.
 */

export { ErrorBoundary } from './ErrorBoundary';
export { ErrorState, type ErrorStateProps } from './ErrorState';
export { OfflineBanner } from './OfflineBanner';
export { LoadingScreen, QueryBoundary, type QueryBoundaryProps } from './QueryBoundary';
export { errorCopy, errorReference } from './error-messages';
