import { describe, expect, it } from 'vitest';
import { MasteryLevel } from '@prisma/client';
import {
  BASE_POINTS,
  NEUTRAL_INTENSITY,
  pointsForActivity,
  pointsForAssessment,
  pointsForLesson,
  pointsForMastery,
  scaleFor,
} from './learning.points';

const ALL_LEVELS = Object.values(MasteryLevel);

// ── The school's dial ───────────────────────────────────────────────────────

describe('scaleFor', () => {
  it('leaves the written amounts alone at the column default', () => {
    expect(scaleFor(NEUTRAL_INTENSITY)).toBe(1);
  });

  it('is a real off switch at zero', () => {
    expect(scaleFor(0)).toBe(0);
  });

  it('never decreases as the dial rises', () => {
    let previous = -1;
    for (let intensity = 0; intensity <= 100; intensity += 1) {
      const scale = scaleFor(intensity);
      expect(scale, `intensity ${intensity} scales below ${intensity - 1}`).toBeGreaterThanOrEqual(
        previous,
      );
      previous = scale;
    }
  });

  it('stays within a sane range and clamps out-of-band input', () => {
    expect(scaleFor(100)).toBeCloseTo(1.5, 5);
    expect(scaleFor(140)).toBe(scaleFor(100));
    expect(scaleFor(-20)).toBe(0);
  });
});

// ── Activities ──────────────────────────────────────────────────────────────

describe('pointsForActivity', () => {
  it('pays the full award for full marks', () => {
    expect(pointsForActivity(100, NEUTRAL_INTENSITY)).toBe(BASE_POINTS.activity);
  });

  it('pays half for a completed activity that went badly, never nothing', () => {
    expect(pointsForActivity(0, NEUTRAL_INTENSITY)).toBe(BASE_POINTS.activity / 2);
  });

  it('treats unscored work as finished rather than as failed', () => {
    expect(pointsForActivity(null, NEUTRAL_INTENSITY)).toBe(BASE_POINTS.activity);
  });

  it('rises with accuracy', () => {
    let previous = 0;
    for (const score of [0, 25, 50, 75, 100]) {
      const points = pointsForActivity(score, NEUTRAL_INTENSITY);
      expect(points, `${score}% pays less than the score below it`).toBeGreaterThanOrEqual(previous);
      previous = points;
    }
  });

  it('earns at least one point whenever earning is switched on', () => {
    for (let intensity = 1; intensity <= 100; intensity += 1) {
      expect(pointsForActivity(0, intensity), `intensity ${intensity} rounded away`).toBeGreaterThan(0);
    }
  });

  it('earns nothing when the school switched earning off', () => {
    expect(pointsForActivity(100, 0)).toBe(0);
  });

  it('clamps a score outside 0–100 rather than paying out of range', () => {
    expect(pointsForActivity(180, NEUTRAL_INTENSITY)).toBe(BASE_POINTS.activity);
    expect(pointsForActivity(-40, NEUTRAL_INTENSITY)).toBe(BASE_POINTS.activity / 2);
  });
});

// ── Lessons ─────────────────────────────────────────────────────────────────

describe('pointsForLesson', () => {
  it('pays the written amount at the column default', () => {
    expect(pointsForLesson(NEUTRAL_INTENSITY)).toBe(BASE_POINTS.lesson);
  });

  it('is worth less than a marked activity, since nothing was marked', () => {
    expect(pointsForLesson(NEUTRAL_INTENSITY)).toBeLessThan(
      pointsForActivity(100, NEUTRAL_INTENSITY),
    );
  });

  it('is worth more than finishing an activity badly, since it was finished', () => {
    expect(pointsForLesson(NEUTRAL_INTENSITY)).toBeGreaterThan(
      pointsForActivity(0, NEUTRAL_INTENSITY),
    );
  });

  it('stays silent when earning is switched off', () => {
    expect(pointsForLesson(0)).toBe(0);
  });
});

// ── Attempts ────────────────────────────────────────────────────────────────

describe('pointsForAssessment', () => {
  it('pays the full award for a full-marks attempt', () => {
    expect(pointsForAssessment(100, 12, NEUTRAL_INTENSITY)).toBe(BASE_POINTS.assessment);
  });

  it('pays nothing for an attempt that presented no items', () => {
    expect(pointsForAssessment(100, 0, NEUTRAL_INTENSITY)).toBe(0);
  });

  it('is worth more than a single activity, since it covers several', () => {
    expect(pointsForAssessment(60, 10, NEUTRAL_INTENSITY)).toBeGreaterThan(
      pointsForActivity(60, NEUTRAL_INTENSITY),
    );
  });
});

// ── Mastery milestones ──────────────────────────────────────────────────────

describe('pointsForMastery', () => {
  it('pays only for levels worth celebrating', () => {
    for (const level of ALL_LEVELS) {
      const points = pointsForMastery(level, NEUTRAL_INTENSITY);
      const celebrated = level === MasteryLevel.PROFICIENT || level === MasteryLevel.MASTERED;
      expect(points > 0, `${level} pays ${points}`).toBe(celebrated);
    }
  });

  it('pays more for mastered than for proficient', () => {
    expect(pointsForMastery(MasteryLevel.MASTERED, NEUTRAL_INTENSITY)).toBeGreaterThan(
      pointsForMastery(MasteryLevel.PROFICIENT, NEUTRAL_INTENSITY),
    );
  });

  it('is the largest single award, because it is the hardest to earn', () => {
    expect(pointsForMastery(MasteryLevel.MASTERED, NEUTRAL_INTENSITY)).toBeGreaterThan(
      pointsForAssessment(100, 20, NEUTRAL_INTENSITY),
    );
  });

  it('stays silent when earning is switched off', () => {
    expect(pointsForMastery(MasteryLevel.MASTERED, 0)).toBe(0);
  });
});
