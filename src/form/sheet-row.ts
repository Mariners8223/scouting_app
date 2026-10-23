import { answerQuestions, answerToString } from './logic';
import type { AnswerValue, FormSchema, Question, Submission } from './types';

/** Turns a saved form into the row the Apps Script appends to the spreadsheet. */

export type CellValue = string | number | boolean;

/** One form to append to a tab of the scouting spreadsheet. */
export type SheetRow = {
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

export function toSheetRow(submission: Submission, template: FormSchema | undefined): SheetRow {
  const sheet = submission.sheetName || template?.sheetName || template?.name || 'Scouting';
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
    return { sheet, id: submission.id, keyColumn: layout.key, cells, named, columns };
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
    sheet,
    id: submission.id,
    cells: {},
    named,
    columns: [...BASE_COLUMNS, ...(template ? [...questions.keys()] : Object.keys(submission.answers))],
  };
}
