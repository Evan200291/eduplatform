/**
 * Router `state` carried into a student detail link.
 *
 * There is no staff endpoint for "look up one student by id" in this surface's
 * API set — a name only exists embedded in list responses (a roster, a learning
 * path, a recommendation). Passing it through navigation state means the detail
 * page can show a name immediately when reached by a click, and still works
 * (minus the header name) when reached by a direct URL or a refresh.
 */
export interface StudentNavState {
  displayName?: string;
  classId?: string;
  className?: string;
}
