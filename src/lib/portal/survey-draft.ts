type Answer = { score: number | null; note: string; issueDescription: string }
/** The existing draft payload includes answered questions only. */
export function acceptedDraftValues(previous: Record<string, Answer>, submitted: Record<string, Answer>): Record<string, Answer> {
  return Object.fromEntries(Object.entries(submitted).map(([id, answer]) => [
    id, answer.score == null ? previous[id] : { ...answer },
  ]))
}
