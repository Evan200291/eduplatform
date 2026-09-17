import { paths } from '@/routes/paths';
import type { LearnerAction } from './dashboard.types';

/**
 * Where the learner home page's "Next up" button goes.
 *
 * The server's `LearnerAction` names what to do and why (`kind`, `reason`) but
 * carries no route — it doesn't know the frontend exists. This was previously
 * read as `nextAction.path`, a field the API never sent, so the loudest button
 * on the learner home page linked to `undefined` for every learner.
 *
 * `FINISH_SCREENING` is the only kind with an exact page (`ScreeningPage` finds
 * the school's one screening assessment itself, so no id is needed). The
 * assignment-shaped kinds (`FINISH_OVERDUE`, `RESUME_ACTIVITY`,
 * `START_ASSIGNMENT`) point at My progress, because starting one properly
 * means calling `POST /assignments/:id/start` first — `SetWorkList` there does
 * that and then opens the right player; a bare link cannot. `CONTINUE_PATH` and
 * `PRACTISE_TOPIC` land on the learner's active path, which already highlights
 * what to do next; the dashboard response doesn't include the subject or path
 * id a deep link would need.
 */
export function nextActionPath(action: LearnerAction): string {
  switch (action.kind) {
    case 'FINISH_SCREENING':
      return paths.learn.screening;
    case 'FINISH_OVERDUE':
    case 'RESUME_ACTIVITY':
    case 'START_ASSIGNMENT':
      return paths.learn.progress;
    case 'FINISH_MISSION':
      return paths.learn.missions;
    case 'CONTINUE_PATH':
    case 'PRACTISE_TOPIC':
    case 'EXPLORE':
      return paths.learn.activities;
    default:
      return paths.learn.activities;
  }
}
