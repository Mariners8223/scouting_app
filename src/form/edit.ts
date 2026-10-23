import { answerQuestions, newId } from './logic';
import type { FormSchema, Question, Section } from './types';

/** Helpers for changing a template in the Form Editor. */

export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function allQuestionIds(schema: FormSchema) {
  return new Set(schema.sections.flatMap((s) => s.questions.map((q) => q.id)));
}

export function uniqueId(base: string, taken: Set<string>) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** "How many cycles" -> "howManyCycles". Falls back to q1, q2... for non-English labels. */
export function idFromLabel(label: string, taken: Set<string>) {
  const words = label
    .replace(/\{\w+\}/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const base = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
    .slice(0, 40);
  if (base && /^[A-Za-z]/.test(base)) return uniqueId(base, taken);
  let n = 1;
  while (taken.has(`q${n}`)) n++;
  return `q${n}`;
}

/** Copies a tab with fresh question ids, e.g. Active -> Active 2. Conditions inside the copy follow the new ids. */
export function duplicateSection(schema: FormSchema, section: Section): Section {
  const taken = allQuestionIds(schema);
  const renamed = new Map<string, string>();
  for (const q of section.questions) {
    const id = uniqueId(q.id.replace(/_\d+$/, ''), taken);
    taken.add(id);
    renamed.set(q.id, id);
  }
  const questions: Question[] = section.questions.map((q) => ({
    ...q,
    id: renamed.get(q.id)!,
    showIf: q.showIf && { ...q.showIf, questionId: renamed.get(q.showIf.questionId) ?? q.showIf.questionId },
  }));
  return { ...section, id: newId('tab'), title: `${section.title} copy`, questions };
}

/** Questions a condition or tab order can depend on: the ones with a fixed list of answers. */
export function choiceQuestions(schema: FormSchema) {
  return schema.sections.flatMap((section) =>
    section.questions
      .filter((q) => q.type === 'enum' || q.type === 'enumList' || q.type === 'yesNo')
      .map((question) => ({ section, question })),
  );
}

export function choicesOf(question: Question | undefined) {
  if (!question) return [];
  return question.type === 'yesNo' ? ['N', 'Y'] : (question.options ?? []);
}

export function findQuestion(schema: FormSchema, id: string | undefined) {
  return id ? answerQuestions(schema).find((q) => q.id === id) : undefined;
}
