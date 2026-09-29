export function createStore(initial = {}) {
  const state = {
    academies: [],
    memberships: {},
    subjects: [],
    classrooms: [],
    homework: [],
    submissions: [],
    submissionVersions: [],
    assessmentRevisions: [],
    enrollments: [],
    recommendations: [],
    credentials: [],
    ...initial,
  };

  const list = (collection) => state[collection] ?? [];
  const find = (collection, id) => list(collection).find((item) => item.id === id) ?? null;

  function upsert(collection, item) {
    if (!item?.id) return null;
    const index = list(collection).findIndex((entry) => entry.id === item.id);
    if (index < 0) state[collection] = [item, ...list(collection)];
    else state[collection] = list(collection).map((entry) => (entry.id === item.id ? { ...entry, ...item } : entry));
    return item;
  }

  const academies = () => (Array.isArray(state.academies) ? state.academies : Object.values(state.academies ?? {}));

  return {
    state,
    upsert,
    academyById: (id) => academies().find((academy) => academy?.id === id) ?? null,
    classroomById: (id) => find('classrooms', id),
    homeworkById: (id) => find('homework', id),
    submissionById: (id) => find('submissions', id),
    assessmentRevisionById: (id) => find('assessmentRevisions', id),
    enrollmentById: (id) => find('enrollments', id),
    credentialById: (id) => find('credentials', id),
    membershipOf: (pubkey) => state.memberships?.[pubkey] ?? 'none',
    // The class roster is derived from approved enrollments, never trusted from
    // the request. Used by SUBMIT authorization.
    activeStudentIds: (classroomId) =>
      list('enrollments')
        .filter((entry) => entry.classroomId === classroomId && entry.status === 'approved')
        .map((entry) => entry.learnerId),
  };
}
