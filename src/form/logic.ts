import type { AnswerValue, Answers, Condition, FormSchema, Question, Section } from './types';

export function newId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function isEmpty(value: AnswerValue | undefined) {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

export function answerToString(value: AnswerValue | undefined) {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

export function evaluate(condition: Condition | undefined, answers: Answers) {
  if (!condition || !condition.questionId) return true;
  const value = answers[condition.questionId];
  const matches = Array.isArray(value)
    ? value.includes(condition.value)
    : answerToString(value) === condition.value;
  return condition.op === 'equals' ? matches : !matches;
}

/** Replaces {questionId} with that question's answer, e.g. "Defense on {team}". */
export function interpolate(text: string, answers: Answers) {
  return text.replace(/\{(\w+)\}/g, (_, id: string) => answerToString(answers[id]) || '?');
}

/** Visible sections, in the order the order rule picks for the current answers. */
export function orderedSections(schema: FormSchema, answers: Answers): Section[] {
  const visible = schema.sections.filter((s) => evaluate(s.showIf, answers));
  const rule = schema.orderRule;
  if (!rule) return visible;

  const variant = rule.variants[answerToString(answers[rule.questionId])];
  if (!variant) return visible;

  const rank = (s: Section) => {
    const i = variant.indexOf(s.id);
    return i === -1 ? variant.length + visible.indexOf(s) : i;
  };
  return [...visible].sort((a, b) => rank(a) - rank(b));
}

export function visibleQuestions(section: Section, answers: Answers) {
  return section.questions.filter((q) => evaluate(q.showIf, answers));
}

/** The stored answer, or the starting value a counter shows before it is touched. */
export function effectiveAnswer(question: Question, answers: Answers): AnswerValue | undefined {
  const value = answers[question.id];
  if (isEmpty(value) && question.type === 'number') return question.min ?? 0;
  return value;
}

export function isAnswered(question: Question, answers: Answers) {
  return question.type === 'header' || !question.required || !isEmpty(effectiveAnswer(question, answers));
}

/** Visible sections that still have unanswered required questions. */
export function missingBySection(schema: FormSchema, answers: Answers) {
  const missing: { section: Section; questions: Question[] }[] = [];
  for (const section of orderedSections(schema, answers)) {
    const questions = visibleQuestions(section, answers).filter((q) => !isAnswered(q, answers));
    if (questions.length) missing.push({ section, questions });
  }
  return missing;
}

/** Only the answers the scouter could see, so hidden leftovers never reach the sheet. */
export function visibleAnswers(schema: FormSchema, answers: Answers): Answers {
  const result: Answers = {};
  for (const section of orderedSections(schema, answers)) {
    for (const q of visibleQuestions(section, answers)) {
      const value = effectiveAnswer(q, answers);
      if (q.type !== 'header' && !isEmpty(value)) result[q.id] = value;
    }
  }
  return result;
}

/** Every question that stores an answer, in form order. Used for Sheets columns and pickers. */
export function answerQuestions(schema: FormSchema) {
  return schema.sections.flatMap((s) => s.questions.filter((q) => q.type !== 'header'));
}

/** Problems that would break the form, shown in the editor before saving. */
export function schemaProblems(schema: FormSchema) {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const section of schema.sections) {
    for (const q of section.questions) {
      if (!/^\w+$/.test(q.id)) problems.push(`"${q.label}": the id may only use letters, numbers and _`);
      if (ids.has(q.id)) problems.push(`The id "${q.id}" is used more than once`);
      ids.add(q.id);
      if ((q.type === 'enum' || q.type === 'enumList') && !q.options?.length) {
        problems.push(`"${q.label}" has no options`);
      }
    }
  }
  if (!schema.sections.length) problems.push('The form needs at least one tab');
  for (const section of schema.sections) {
    if (section.showIf && !ids.has(section.showIf.questionId)) {
      problems.push(`Tab "${section.title}" depends on a question that no longer exists`);
    }
    for (const q of section.questions) {
      if (q.showIf && !ids.has(q.showIf.questionId)) {
        problems.push(`"${q.label}" depends on a question that no longer exists`);
      }
    }
  }
  if (schema.orderRule && !ids.has(schema.orderRule.questionId)) {
    problems.push('The tab order depends on a question that no longer exists');
  }
  problems.push(...columnProblems(schema));
  return problems;
}

/** Fixed column layout: every letter valid and used by only one thing. */
function columnProblems(schema: FormSchema) {
  const layout = schema.columnLayout;
  if (!layout) return [];
  const problems: string[] = [];
  const owners = new Map<string, string>();
  const claim = (column: string, owner: string) => {
    if (!/^[A-Z]{1,3}$/.test(column)) problems.push(`${owner}: "${column}" is not a column letter`);
    else if (owners.has(column)) problems.push(`Column ${column} is used by both ${owners.get(column)} and ${owner}`);
    owners.set(column, owner);
  };
  claim(layout.key, 'the form id');
  for (const column of Object.keys(layout.constants ?? {})) claim(column, `the fixed value in ${column}`);
  for (const q of answerQuestions(schema)) if (q.column) claim(q.column, `"${q.label}"`);
  return problems;
}
