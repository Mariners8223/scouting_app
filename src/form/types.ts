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
  /** Older templates only: a fixed spreadsheet column letter. Answers now go by name (the id); see FormSchema. */
  column?: string;
};

export type Section = {
  id: string;
  title: string;
  questions: Question[];
  showIf?: Condition;
  /**
   * Numbers this tab by its place among the visible tabs with the same word, e.g. "Shift":
   * "Shift 1 · Inactive", "Shift 2 · Active"... so the numbers follow the tab order rule.
   */
  numberedAs?: string;
};

/**
 * Lets the order of the tabs depend on an answer, e.g. who won Auto.
 * Sections missing from a variant keep their default place at the end.
 */
export type SectionOrderRule = {
  questionId: string;
  variants: Record<string, string[]>;
};

/**
 * Older templates only: fixed column letters. The editor can convert them to named ranges
 * ("Switch to named ranges"), after which the sheet decides where each answer goes.
 */
export type ColumnLayout = {
  /** Column that gets the submission id; a form the sheet already has is skipped. */
  key: string;
  /** Same value in every row, e.g. { C: 'Mariners' }. */
  constants?: Record<string, string>;
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
  /** Google spreadsheet id that receives this form's answers. Empty = the script's home spreadsheet. */
  spreadsheetId?: string;
  /** Spreadsheet tab that receives this form's answers. Defaults to the template name. */
  sheetName?: string;
  /** The version last published to all phones (or downloaded from there). */
  publishedVersion?: number;
  /**
   * The published version this copy actually is (downloaded, or published from this phone). A publish
   * replaces the copy whenever its version differs. Copies from before this field always get replaced once.
   */
  downloadedVersion?: number;
  /**
   * Same value in every row, by name, e.g. { from: 'Mariners' }.
   * Every answer is sent by its question id; the sheet places each name in the column with that
   * named range (Data > Named ranges), else that header, else a new column.
   */
  constants?: Record<string, string>;
  /** Older templates only: write to fixed column letters. */
  columnLayout?: ColumnLayout;
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
  /** Spreadsheet and tab, fixed when the form is saved so later template edits don't move old rows. */
  spreadsheetId?: string;
  sheetName?: string;
  answers: Answers;
  /** When the spreadsheet confirmed it; missing while waiting to be sent. */
  syncedAt?: string;
};
