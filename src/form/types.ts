/**
 * A scouting form is plain data, so it can be edited in the app, saved,
 * shared between devices and replaced every season without code changes.
 */

export type QuestionType =
  | 'enum' // pick one option
  | 'enumList' // pick any number of options
  | 'yesNo' // N / Y
  | 'number' // counter with - / +
  | 'text' // single line
  | 'longText' // multi line
  | 'header'; // title / explanation only, no answer

export const QUESTION_TYPES: { type: QuestionType; label: string }[] = [
  { type: 'enum', label: 'Enum (one choice)' },
  { type: 'enumList', label: 'EnumList (multiple)' },
  { type: 'yesNo', label: 'Yes / No' },
  { type: 'number', label: 'Number (counter)' },
  { type: 'text', label: 'Text' },
  { type: 'longText', label: 'Long text' },
  { type: 'header', label: 'Header (no answer)' },
];

export type Condition = {
  questionId: string;
  op: 'equals' | 'notEquals';
  value: string;
};

export type Question = {
  /** Stable id, also used as the column name in Google Sheets. */
  id: string;
  type: QuestionType;
  /** Can include {questionId} placeholders, e.g. "Defense on {team}". */
  label: string;
  description?: string;
  required?: boolean;
  /** enum / enumList */
  options?: string[];
  /** number */
  min?: number;
  max?: number;
  step?: number;
  /** Only shown (and only required) when this condition is true. */
  showIf?: Condition;
  /** Keep the answer for the next match (e.g. scouter name). Numbers go up by one step. */
  keepAfterSubmit?: boolean;
};

export type Section = {
  id: string;
  title: string;
  questions: Question[];
  showIf?: Condition;
};

/**
 * Lets the order of the tabs depend on an answer, e.g. who won Auto.
 * Sections missing from a variant keep their default place at the end.
 */
export type SectionOrderRule = {
  questionId: string;
  variants: Record<string, string[]>;
};

/** A question template for one season. Every year gets its own. */
export type FormSchema = {
  id: string;
  name: string;
  /** FRC season, e.g. 2026. */
  year: number;
  /** Bumped on every save, stored with each submission. */
  version: number;
  updatedAt: string;
  sections: Section[];
  orderRule?: SectionOrderRule;
};

export type AnswerValue = string | string[] | number;
export type Answers = Record<string, AnswerValue | undefined>;

export type Submission = {
  id: string;
  createdAt: string;
  schemaId: string;
  schemaVersion: number;
  answers: Answers;
};
