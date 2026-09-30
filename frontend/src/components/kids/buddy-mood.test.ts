import { describe, expect, it } from 'vitest';
import { buddyMoodFor } from './buddy-mood';

describe('buddyMoodFor', () => {
  it('maps the companion moods onto Pip faces', () => {
    expect(buddyMoodFor('Sleepy')).toBe('sleepy');
    expect(buddyMoodFor('excited')).toBe('cheer');
    expect(buddyMoodFor('curious')).toBe('think');
    expect(buddyMoodFor('worried')).toBe('oops');
  });

  it('falls back to a smile for anything unknown or missing', () => {
    expect(buddyMoodFor('sparkly')).toBe('happy');
    expect(buddyMoodFor(null)).toBe('happy');
    expect(buddyMoodFor(undefined)).toBe('happy');
  });
});
