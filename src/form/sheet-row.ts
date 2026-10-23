import { answerQuestions, answerToString } from './logic';
import type { Answers, AnswerValue, FormSchema, Question, Submission } from './types';

/** Turns a saved form into the row the Apps Script appends to the spreadsheet. */

export type CellValue = string | number | boolean;

/** One form to append to a tab of the scouting spreadsheet. */
export type SheetRow = {
  /** Google spreadsheet id; empty = the script's home spreadsheet. */
  spreadsheetId?: string;
  /** Tab name in the spreadsheet; created if missing. */
  sheet: string;
  /** Submission id; a form the sheet already has is skipped. */
  id: string;
  /** Column letter that holds the id. Without it the id goes under the "submissionId" header. */
  keyColumn?: string;
  /** Values by column letter, for a sheet with a fixed layout. */
  cells: Record<string, CellValue>;
  /** Values by header name; missing headers are added after the last column. */
  named: Record<string, CellValue>;
  /** Preferred order for new headers; columns the sheet already has are never moved. */
  columns: string[];
};

const BASE_COLUMNS = ['submissionId', 'submittedAt', 'template', 'formVersion'];

/**
 * The value types AppSheet wrote, so the dashboard formulas match the same way:
 * numbers stay numbers, Y/N becomes TRUE/FALSE and several choices are joined with " , ".
 */
function layoutValue(question: Question | undefined, value: AnswerValue): CellValue {
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

  if (layout) {
    const cells: Record<string, CellValue> = { ...layout.constants, [layout.key]: submission.id };
    const named: Record<string, CellValue> = { submittedAt: submission.createdAt };
    for (const [id, value] of Object.entries(submission.answers)) {
      if (value === undefined) continue;
      const question = questions.get(id);
      if (question?.column) cells[question.column] = layoutValue(question, value);
      else named[id] = layoutValue(question, value);
    }
    const columns = ['submittedAt', ...[...questions.values()].filter((q) => !q.column).map((q) => q.id)];
    return { spreadsheetId, sheet, id: submission.id, keyColumn: layout.key, cells, named, columns };
  }

  const named: Record<string, CellValue> = {
    submissionId: submission.id,
    submittedAt: submission.createdAt,
    template: template ? `${template.year} ${template.name}` : submission.schemaId,
    formVersion: submission.schemaVersion,
  };
  for (const [id, value] of Object.entries(submission.answers)) {
    if (value !== undefined) named[id] = typeof value === 'number' ? value : answerToString(value);
  }
  return {
    spreadsheetId,
    sheet,
    id: submission.id,
    cells: {},
    named,
    columns: [...BASE_COLUMNS, ...(template ? [...questions.keys()] : Object.keys(submission.answers))],
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

/** A spreadsheet cell back to the answer the scouter gave, the reverse of what toSheetRow wrote. */
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

/** Answers of a saved form read back from its spreadsheet row (header row + that row's values). */
export function answersFromRow(template: FormSchema, headers: string[], values: unknown[]): Answers {
  const answers: Answers = {};
  for (const q of answerQuestions(template)) {
    const at = template.columnLayout && q.column ? columnIndex(q.column) : headers.indexOf(q.id);
    const value = at >= 0 ? answerFromCell(q, values[at]) : undefined;
    if (value !== undefined) answers[q.id] = value;
  }
  return answers;
}
