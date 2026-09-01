import { createContext, useContext } from 'react';

/**
 * Wiring shared between a `Field` and the control inside it.
 *
 * Labels, hints and error messages have to be associated by id for a screen
 * reader to read them with the input. Doing it through context means a
 * developer cannot forget: dropping an `<Input>` inside a `<Field>` is enough.
 */
export interface FieldContextValue {
  inputId: string;
  /** Space-separated id list for `aria-describedby`, or undefined if none. */
  describedBy: string | undefined;
  isInvalid: boolean;
  isRequired: boolean;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

/** Returns the field wiring, or nulls when a control is used standalone. */
export function useFieldContext(): FieldContextValue {
  return (
    useContext(FieldContext) ?? {
      inputId: '',
      describedBy: undefined,
      isInvalid: false,
      isRequired: false,
    }
  );
}
