import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { authActions } from '@/auth';
import { applyPreferences, usePreferences } from '@/theme';
import { App } from './App';
import './styles/tokens.css';
import './styles/global.css';

/**
 * Application entry.
 *
 * Two things happen before React mounts, both because they must not depend on a
 * component rendering first:
 *
 *  1. Accessibility preferences are written to `<html>`. A learner who has chosen
 *     larger text should never see a frame of the default size.
 *  2. `bootstrap()` starts restoring the session. The access token is memory-only,
 *     so on a hard refresh the httpOnly refresh cookie is the only proof of
 *     identity — it has to be exchanged before the guards can tell a signed-in
 *     user from a visitor. It is deliberately not awaited: the guards render
 *     `status === 'unknown'` as a loading state, so the shell paints immediately.
 */

applyPreferences(usePreferences.getState());

void authActions.bootstrap();

const container = document.getElementById('root');

if (!container) {
  // index.html is part of the build, so this only fires if the shell was replaced.
  throw new Error('Cannot start Midas: no #root element in the document.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
