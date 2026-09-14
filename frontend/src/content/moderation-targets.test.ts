import { describe, expect, it } from 'vitest';
import { moderationTarget, oneBusinessDayAfter } from './moderation-targets';

// Local-time constructors, so the weekday maths does not depend on the test machine's zone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0, 0);

describe('oneBusinessDayAfter', () => {
  it('is the next weekday at the same time', () => {
    expect(oneBusinessDayAfter(at(2026, 9, 14, 15))).toEqual(at(2026, 9, 15, 15)); // Mon -> Tue
  });

  it('skips the weekend from a Friday', () => {
    expect(oneBusinessDayAfter(at(2026, 9, 18, 15))).toEqual(at(2026, 9, 21, 15)); // Fri -> Mon
  });

  it('counts a weekend report from Monday morning', () => {
    expect(oneBusinessDayAfter(at(2026, 9, 19, 20))).toEqual(at(2026, 9, 22, 9)); // Sat -> Tue 09:00
  });
});

describe('moderationTarget', () => {
  const base = { decision: 'PENDING' as const, resolvedAt: null };

  it('treats safeguarding reasons as urgent', () => {
    const target = moderationTarget({ ...base, reason: 'INAPPROPRIATE_CONTENT', createdAt: at(2026, 9, 14).toISOString() });
    expect(target.state).toBe('urgent');
    expect(target.dueAt).toBeNull();
  });

  it('flags a pending report past its business-day target', () => {
    const target = moderationTarget(
      { ...base, reason: 'FACTUAL_ERROR', createdAt: at(2026, 9, 14, 10).toISOString() },
      at(2026, 9, 15, 11),
    );
    expect(target.state).toBe('overdue');
  });

  it('warns in the last four hours', () => {
    const target = moderationTarget(
      { ...base, reason: 'BROKEN_ACTIVITY', createdAt: at(2026, 9, 14, 10).toISOString() },
      at(2026, 9, 15, 7),
    );
    expect(target.state).toBe('due-soon');
  });

  it('records whether a decided report met its target', () => {
    const late = moderationTarget({
      reason: 'OTHER',
      decision: 'APPROVED',
      createdAt: at(2026, 9, 14, 10).toISOString(),
      resolvedAt: at(2026, 9, 16, 10).toISOString(),
    });
    expect(late.state).toBe('missed');
  });
});
