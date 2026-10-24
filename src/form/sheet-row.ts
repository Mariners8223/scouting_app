import { answerQuestions } from './logic';
import type { Answers, AnswerValue, FormSchema, Question, Submission } from './types';

/**
 * Turns a saved form into the row the Apps Script appends to the spreadsheet, and back.
 * Every value has a name (the question id, or key / submittedAt / a fixed value's name); the sheet
 * decides where each name goes with named ranges or headers, so the app never needs column letters.
 */

export type CellValue = string | number | boolean;

/** One form to append to a tab of the scouting spreadsheet. */
export type SheetRow = {
  /** Google spreadsheet id; empty = the script's home spreadsheet. */
  spreadsheetId?: string;
  /** Tab name in the spreadsheet; created if missing. */
  sheet: string;
  /** Submission id; a form the sheet already has is skipped. */
  id: string;
  /** Name of the value holding the id ("key"). */
  keyName?: string;
  /** Older templates only: the column letter holding the id. */
  keyColumn?: string;
  /** Older templates only: values by fixed column letter. */
  cells: Record<string, CellValue>;
  /** Values by name: named range, else header, else a new column. */
  named: Record<string, CellValue>;
  /** Preferred order for new columns; columns the sheet already has are never moved. */
  columns: string[];
};

export const KEY_NAME = 'key';
const BASE_COLUMNS = [KEY_NAME, 'submittedAt', 'template', 'formVersion'];

/**
 * Answers in the shape spreadsheet formulas expect (the same as AppSheet wrote): numbers stay
 * numbers, Y/N becomes TRUE/FALSE and several choices are joined with " , ".
 */
function sheetValue(question: Question | undefined, value: AnswerValue): CellValue {
  if (Array.isArray(value)) return value.join(' , ');
  if (question?.type === 'yesNo') return value === 'Y';
  return value;
}

export const sheetNameOf = (template: FormSchema) => template.sheetName || template.name;

export function toSheetRow(submission: Submission, template: FormSchema | undefined): SheetRow {
  const sheet = submission.sheetName || (template && sheetNameOf(template)) || 'Scouting';
  const spreadsheetId = submission.spreadsheetId ?? template?.spreadsheetId;
  const questions = new Map((template ? answerQuestions(template) : []).map((q) => [q.id, q]));
  const layout = template?.columnLayout;

  // An older template with fixed letters keeps writing where it always did, until it's switched to named ranges.
  if (layout) {
    const cells: Record<string, CellValue> = { ...layout.constants, [layout.key]: submission.id };
    const named: Record<string, CellValue> = { submittedAt: submission.createdAt };
    for (const [id, value] of Object.entries(submission.answers)) {
      if (value === undefined) continue;
      const question = questions.get(id);
      if (question?.column) cells[question.column] = sheetValue(question, value);
      else named[id] = sheetValue(question, value);
    }
    const columns = ['submittedAt', ...[...questions.values()].filter((q) => !q.column).map((q) => q.id)];
    return { spreadsheetId, sheet, id: submission.id, keyColumn: layout.key, cells, named, columns };
  }

  const named: Record<string, CellValue> = {
    [KEY_NAME]: submission.id,
    submittedAt: submission.createdAt,
    template: template ? `${template.year} ${template.name}` : submission.schemaId,
    formVersion: submission.schemaVersion,
    ...template?.constants,
  };
  for (const [id, value] of Object.entries(submission.answers)) {
    if (value !== undefined) named[id] = sheetValue(questions.get(id), value);
  }
  const constants = Object.keys(template?.constants ?? {});
  const answerIds = template ? [...questions.keys()] : Object.keys(submission.answers);
  return {
    spreadsheetId,
    sheet,
    id: submission.id,
    keyName: KEY_NAME,
    cells: {},
    named,
    columns: [...BASE_COLUMNS, ...constants, ...answerIds],
  };
}

/** "A" -> 0, "AA" -> 26. */
export function columnIndex(letter: string) {
  return [...letter].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

/** 0 -> "A", 26 -> "AA". */
export function columnLetter(index: number): string {
  return (index >= 26 ? columnLetter(Math.floor(index / 26) - 1) : '') + String.fromCharCode(65 + (index % 26));
}

/** A spreadsheet cell back to the answer the scouter gave, the reverse of sheetValue. */
function answerFromCell(question: Question, cell: unknown): AnswerValue | undefined {
  if (cell === '' || cell === null || cell === undefined) return undefined;
  switch (question.type) {
    case 'yesNo':
      return cell === true || /^(true|y)$/i.test(String(cell)) ? 'Y' : 'N';
    case 'number':
      return isNaN(Number(cell)) ? String(cell) : Number(cell);
    case 'enumList':
      return String(cell)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    default:
      return String(cell);
  }
}

/**
 * Answers of a saved form read back from its spreadsheet row: by named range (names are
 * lowercase, as the script sends them), else a fixed letter (older templates), else the header.
 */
export function answersFromRow(
  template: FormSchema,
  headers: string[],
  values: unknown[],
  named: Record<string, unknown> = {},
): Answers {
  const answers: Answers = {};
  for (const q of answerQuestions(template)) {
    const byName = q.id.toLowerCase();
    let cell: unknown;
    if (byName in named) cell = named[byName];
    else if (template.columnLayout && q.column) cell = values[columnIndex(q.column)];
    else if (headers.includes(q.id)) cell = values[headers.indexOf(q.id)];
    const value = answerFromCell(q, cell);
    if (value !== undefined) answers[q.id] = value;
  }
  return answers;
}
