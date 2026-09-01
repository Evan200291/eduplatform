import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardBody, IconHelp, Input, focusRing, text } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { DeliveryQuestion } from '@/content/content.types';
import type { ResponseInput } from '@/assessment/assessment.types';

export interface QuestionCardProps {
  question: DeliveryQuestion;
  onSubmit: (response: ResponseInput, hintsUsed: number) => void;
  isSubmitting: boolean;
  /** Only present when the assessment shows feedback immediately. */
  feedback?: { isCorrect?: boolean; feedback?: string } | null;
}

/**
 * The right-hand side of a matching question isn't its own delivery field —
 * the answer key (`matchKey`) is stripped from `options` before it reaches a
 * student, so the only place the set of things-to-match-against survives is
 * `question.config.pairs[].right` (see `content.helpers.ts` /
 * `question.seed.ts`: options are built one-to-one with `pairs`, in the same
 * order, `option.label` mirroring `pairs[].left`). That lets a left item be
 * tied back to its delivery option by index.
 */
interface MatchingPair {
  left: string;
  right: string;
}

function parseMatchingConfig(config: unknown): MatchingPair[] | null {
  if (!config || typeof config !== 'object') return null;
  const pairs = (config as { pairs?: unknown }).pairs;
  if (!Array.isArray(pairs)) return null;
  const parsed: MatchingPair[] = [];
  for (const entry of pairs) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { left?: unknown }).left === 'string' &&
      typeof (entry as { right?: unknown }).right === 'string'
    ) {
      parsed.push({ left: (entry as MatchingPair).left, right: (entry as MatchingPair).right });
    }
  }
  return parsed.length > 0 ? parsed : null;
}

/** Deterministic-enough shuffle so the right column doesn't just mirror the left one. */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Renders one delivery question and collects an answer.
 *
 * Sorting questions arrive with only their option list (no separate "target"
 * column in the delivery payload) — the options *are* the items to order.
 * Matching questions carry their right-hand terms in `question.config.pairs`
 * (see `parseMatchingConfig`), so each left-hand option (a card in
 * `question.options`) can be paired against one of those terms by
 * click-to-select.
 */
export function QuestionCard({ question, onSubmit, isSubmitting, feedback }: QuestionCardProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [boolValue, setBoolValue] = useState<boolean | null>(null);
  const [numericValue, setNumericValue] = useState('');
  const [textValue, setTextValue] = useState('');
  const [order, setOrder] = useState<string[]>(question.options.map((o) => o.id));
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [activeLeftId, setActiveLeftId] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});

  const matchingPairs = useMemo(() => parseMatchingConfig(question.config), [question.config]);
  // Right-hand terms line up with `question.options` by index (both are built
  // from the same authored pair list), so a left option can look up its term.
  const rightForOption = useMemo(() => {
    const map = new Map<string, string>();
    if (matchingPairs) {
      question.options.forEach((option, index) => {
        const term = matchingPairs[index]?.right;
        if (term) map.set(option.id, term);
      });
    }
    return map;
  }, [matchingPairs, question.options]);
  const shuffledRightTerms = useMemo(
    () => shuffle([...rightForOption.values()]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question.id],
  );

  useEffect(() => {
    setSelectedOptionId(null);
    setBoolValue(null);
    setNumericValue('');
    setTextValue('');
    setOrder(question.options.map((o) => o.id));
    setHintsRevealed(0);
    setActiveLeftId(null);
    setPairs({});
  }, [question.id, question.options]);

  const canAnswer = !feedback;

  function submit() {
    let response: ResponseInput;
    switch (question.type) {
      case 'MULTIPLE_CHOICE':
        if (!selectedOptionId) return;
        response = { optionIds: [selectedOptionId] };
        break;
      case 'TRUE_FALSE':
        if (boolValue === null) return;
        response = { booleanValue: boolValue };
        break;
      case 'NUMERIC':
        if (numericValue.trim() === '') return;
        response = { numericValue: Number(numericValue) };
        break;
      case 'SHORT_TEXT':
        if (textValue.trim() === '') return;
        response = { textValue: textValue.trim() };
        break;
      case 'SORTING':
        response = { orderedOptionIds: order };
        break;
      case 'MATCHING':
        if (rightForOption.size === 0) {
          // No usable config — nothing to build a fair UI from. Move on rather
          // than block the learner on a broken item.
          response = { skipped: true };
        } else {
          if (Object.keys(pairs).length !== rightForOption.size) return;
          response = {
            pairs: Object.entries(pairs).map(([optionId, matchKey]) => ({ optionId, matchKey })),
          };
        }
        break;
      default:
        response = { skipped: true };
        break;
    }
    onSubmit(response, hintsRevealed);
  }

  function moveOption(index: number, direction: -1 | 1) {
    setOrder((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const hasAnswer =
    (question.type === 'MULTIPLE_CHOICE' && selectedOptionId !== null) ||
    (question.type === 'TRUE_FALSE' && boolValue !== null) ||
    (question.type === 'NUMERIC' && numericValue.trim() !== '') ||
    (question.type === 'SHORT_TEXT' && textValue.trim() !== '') ||
    question.type === 'SORTING' ||
    (question.type === 'MATCHING' &&
      (rightForOption.size === 0 || Object.keys(pairs).length === rightForOption.size));

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 p-6">
        <p className={cn(text.heading, 'text-xl text-balance')}>{question.prompt}</p>

        {question.type === 'MULTIPLE_CHOICE' ? (
          <div className="flex flex-col gap-2">
            {question.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={!canAnswer}
                onClick={() => setSelectedOptionId(option.id)}
                className={cn(
                  'min-h-touch rounded-lg border-2 px-4 py-3 text-left text-lg font-medium',
                  'transition-[background-color,border-color,color] duration-fast ease-standard',
                  focusRing,
                  selectedOptionId === option.id
                    ? 'border-primary bg-primary-soft text-primary-strong'
                    : 'border-line-strong text-ink hover:border-primary-muted hover:bg-primary-soft',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {question.type === 'TRUE_FALSE' ? (
          <div className="flex gap-3">
            <Button
              variant={boolValue === true ? 'primary' : 'outline'}
              disabled={!canAnswer}
              onClick={() => setBoolValue(true)}
            >
              True
            </Button>
            <Button
              variant={boolValue === false ? 'primary' : 'outline'}
              disabled={!canAnswer}
              onClick={() => setBoolValue(false)}
            >
              False
            </Button>
          </div>
        ) : null}

        {question.type === 'NUMERIC' ? (
          <Input
            type="number"
            inputMode="decimal"
            value={numericValue}
            disabled={!canAnswer}
            onChange={(event) => setNumericValue(event.target.value)}
            className="max-w-xs"
            aria-label="Your answer"
          />
        ) : null}

        {question.type === 'SHORT_TEXT' ? (
          <Input
            type="text"
            value={textValue}
            disabled={!canAnswer}
            onChange={(event) => setTextValue(event.target.value)}
            aria-label="Your answer"
          />
        ) : null}

        {question.type === 'SORTING' ? (
          <ol className="flex flex-col gap-2">
            {order.map((optionId, index) => {
              const option = question.options.find((o) => o.id === optionId);
              if (!option) return null;
              return (
                <li
                  key={optionId}
                  className="flex items-center justify-between gap-3 rounded-lg border-2 border-line-strong px-3 py-2"
                >
                  <span className="text-base font-medium text-ink">
                    {index + 1}. {option.label}
                  </span>
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canAnswer || index === 0}
                      onClick={() => moveOption(index, -1)}
                      aria-label={`Move "${option.label}" up`}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canAnswer || index === order.length - 1}
                      onClick={() => moveOption(index, 1)}
                      aria-label={`Move "${option.label}" down`}
                    >
                      ↓
                    </Button>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}

        {question.type === 'MATCHING' ? (
          rightForOption.size === 0 ? (
            <p className="text-sm text-ink-muted">
              This question isn&apos;t set up yet — moving on for you.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-muted">Tap an item on the left, then tap its match on the right.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  {question.options.map((option) => {
                    const isPaired = Boolean(pairs[option.id]);
                    const isActive = activeLeftId === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={!canAnswer}
                        onClick={() => setActiveLeftId(option.id)}
                        className={cn(
                          'min-h-touch rounded-lg border-2 px-3 py-2 text-left text-base font-medium',
                          'transition-[background-color,border-color,color] duration-fast ease-standard',
                          focusRing,
                          isActive
                            ? 'border-primary bg-primary-soft text-primary-strong'
                            : isPaired
                              ? 'border-success-muted bg-success-soft text-ink'
                              : 'border-line-strong text-ink hover:border-primary-muted hover:bg-primary-soft',
                        )}
                      >
                        {option.label}
                        {isPaired ? (
                          <span className="ml-2 text-xs text-ink-muted">→ {pairs[option.id]}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-2">
                  {shuffledRightTerms.map((term) => {
                    const takenBy = Object.entries(pairs).find(([, value]) => value === term)?.[0];
                    return (
                      <button
                        key={term}
                        type="button"
                        disabled={!canAnswer || !activeLeftId}
                        onClick={() => {
                          if (!activeLeftId) return;
                          setPairs((current) => {
                            const next = { ...current };
                            // A term already used by another item is freed up
                            // when it's re-picked for this one.
                            for (const key of Object.keys(next)) {
                              if (next[key] === term) delete next[key];
                            }
                            next[activeLeftId] = term;
                            return next;
                          });
                          setActiveLeftId(null);
                        }}
                        className={cn(
                          'min-h-touch rounded-lg border-2 px-3 py-2 text-left text-base font-medium',
                          'transition-[background-color,border-color,color] duration-fast ease-standard',
                          focusRing,
                          takenBy
                            ? 'border-success-muted bg-success-soft text-ink'
                            : 'border-line-strong text-ink hover:border-primary-muted hover:bg-primary-soft',
                        )}
                      >
                        {term}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )
        ) : null}

        {question.hints.length > 0 && canAnswer ? (
          <div className="flex flex-col gap-2">
            {question.hints.slice(0, hintsRevealed).map((hint) => (
              <p
                key={hint.id}
                className="rounded-lg border-l-4 border-l-secondary bg-secondary-soft px-3 py-2 text-base text-secondary-strong"
              >
                {hint.body}
              </p>
            ))}
            {hintsRevealed < question.hints.length ? (
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={<IconHelp aria-hidden className="h-4 w-4" />}
                onClick={() => setHintsRevealed((n) => n + 1)}
              >
                Get a hint
              </Button>
            ) : null}
          </div>
        ) : null}

        {feedback ? (
          <div
            className={cn(
              'flex flex-col gap-1 rounded-lg border-2 p-4',
              feedback.isCorrect
                ? 'border-success-muted bg-success-soft'
                : 'border-secondary-muted bg-secondary-soft',
            )}
          >
            <p
              className={cn(
                text.heading,
                'text-lg',
                feedback.isCorrect ? 'text-success-strong' : 'text-secondary-strong',
              )}
            >
              {feedback.isCorrect === true
                ? 'Correct!'
                : feedback.isCorrect === false
                  ? 'Not quite — nice try.'
                  : 'Answer recorded.'}
            </p>
            {feedback.feedback ? <p className="leading-body text-ink">{feedback.feedback}</p> : null}
          </div>
        ) : (
          <Button
            size="lg"
            onClick={submit}
            isLoading={isSubmitting}
            disabled={!hasAnswer}
            className="self-start"
          >
            {question.type === 'MATCHING' && rightForOption.size === 0 ? 'Skip' : 'Check my answer'}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
