import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  PageHeader,
  Select,
} from '@/components/ui';
import {
  TEXT_SCALES,
  TEXT_SCALE_LABELS,
  usePreferences,
  type MotionPreference,
  type TextScale,
} from '@/theme';
import { useDocumentTitle } from '@/hooks/use-document-title';

const MOTION_OPTIONS: { value: MotionPreference; label: string }[] = [
  { value: 'system', label: 'Match my device setting' },
  { value: 'reduced', label: 'Reduce movement' },
  { value: 'full', label: 'Allow movement' },
];

/**
 * The learner's own display controls.
 *
 * These deliberately outrank the school's branding — the CSS that implements them
 * sits outside `@layer` in `global.css` for exactly that reason. A school can
 * choose its colours; it cannot choose that a photosensitive child must watch
 * things move.
 *
 * Applied instantly on change, with no Save button. There is nothing to validate
 * and nothing to lose, and an immediate result is the point: you pick the text
 * size by looking at it.
 */
export function PreferencesPage() {
  useDocumentTitle('Accessibility & display');
  const { textScale, motion, highContrast, set, reset } = usePreferences();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accessibility & display"
        description="These settings are saved on this device and apply straight away."
      />

      <Card>
        <CardHeader title="Reading" />
        <CardBody className="flex flex-col gap-4">
          <Field label="Text size" hint="Everything grows together, so nothing overlaps.">
            <Select
              value={String(textScale)}
              onChange={(event) => set('textScale', Number(event.target.value) as TextScale)}
              options={TEXT_SCALES.map((scale) => ({
                value: String(scale),
                label: TEXT_SCALE_LABELS[scale],
              }))}
            />
          </Field>

          <p className="rounded-md bg-surface-sunken p-4 text-base leading-body text-ink">
            The quick brown fox jumps over the lazy dog. This is how your reading text will look.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Movement and colour" />
        <CardBody className="flex flex-col gap-4">
          <Field
            label="Animations"
            hint="Celebrations and page transitions. Loading indicators always stay visible."
          >
            <Select
              value={motion}
              onChange={(event) => set('motion', event.target.value as MotionPreference)}
              options={MOTION_OPTIONS}
            />
          </Field>

          <Checkbox
            label="Stronger contrast"
            hint="Darker borders and text, and outlines instead of soft shadows."
            checked={highContrast}
            onChange={(event) => set('highContrast', event.target.checked)}
          />
        </CardBody>
      </Card>

      <div>
        <Button variant="outline" onClick={reset}>
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
