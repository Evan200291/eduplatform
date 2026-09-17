/**
 * Turns a raw Zod validation message into something a nine-year-old can read.
 *
 * `ErrorState` already keys every top-level message off `error.code`, never off
 * the server's `message`, because "the server's message is written for a
 * developer reading a log" (see `components/feedback/error-messages.ts`). The
 * per-field messages inside `issues[]` slipped past that rule: most validation
 * primitives in `backend/src/core/http/validate.ts` (`text()`, `emailSchema`,
 * `percentSchema`...) never set a custom message, so a blank required field
 * anywhere in the app — the sign-in form, a student's name, a class code —
 * surfaced Zod's own English straight to the screen: "String must contain at
 * least 1 character(s)".
 *
 * This is deliberately pattern-matched against Zod v3's known default message
 * shapes, not a general rewrite: a message the backend already wrote by hand
 * (`"That nickname isn't allowed — try another."`, `.refine()` messages
 * throughout the codebase) matches none of these patterns and passes through
 * untouched, exactly as its author intended.
 */
export function humanizeFieldMessage(message: string): string {
  if (message === 'Required') return 'This is required.';

  let m: RegExpExecArray | null;

  if ((m = /^String must contain at least (\d+) character\(s\)$/.exec(message))) {
    const n = Number(m[1]);
    return n <= 1 ? 'This is required.' : `Enter at least ${n} characters.`;
  }
  if ((m = /^String must contain at most (\d+) character\(s\)$/.exec(message))) {
    return `Keep this to ${m[1]} characters or fewer.`;
  }
  if ((m = /^Array must contain at least (\d+) element\(s\)$/.exec(message))) {
    const n = Number(m[1]);
    return n <= 1 ? 'Choose at least one.' : `Choose at least ${n}.`;
  }
  if ((m = /^Array must contain at most (\d+) element\(s\)$/.exec(message))) {
    return `Choose ${m[1]} or fewer.`;
  }
  if ((m = /^Number must be greater than or equal to (-?\d+(?:\.\d+)?)$/.exec(message))) {
    return `Enter ${m[1]} or more.`;
  }
  if ((m = /^Number must be greater than (-?\d+(?:\.\d+)?)$/.exec(message))) {
    return `Enter more than ${m[1]}.`;
  }
  if ((m = /^Number must be less than or equal to (-?\d+(?:\.\d+)?)$/.exec(message))) {
    return `Enter ${m[1]} or less.`;
  }
  if ((m = /^Number must be less than (-?\d+(?:\.\d+)?)$/.exec(message))) {
    return `Enter less than ${m[1]}.`;
  }
  if (message === 'Invalid email') return 'Enter a valid email address.';
  if (message === 'Invalid url') return 'Enter a valid web address.';
  if (message === 'Invalid date' || message === 'Invalid datetime')
    return 'Enter a valid date.';
  if (message === 'Invalid uuid' || message === 'Invalid cuid' || message === 'Invalid cuid2')
    return "That doesn't look right — check it and try again.";
  if (/^Invalid enum value\./.test(message)) return 'Choose one of the options shown.';
  if (/^Expected .+, received undefined$/.test(message)) return 'This is required.';
  if (/^Expected .+, received .+$/.test(message))
    return "That doesn't look right — check it and try again.";
  if (message === 'Invalid input' || message === 'Non-empty array expected')
    return 'Check this and try again.';

  return message;
}
