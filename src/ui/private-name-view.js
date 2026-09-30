import { getPersona } from '../data/personas.js';
import {
  NAME_VIEWER,
  canReadPrivateName,
  formatPrivateName,
  hasPrivateName,
} from '../domain/private-name.js';
import { classroomsForStudent, classroomsForTeacher, enrolledAccountIds } from '../domain/classroom.js';

function rosterFor(state, room) {
  return new Set([...(room.studentIds ?? []), ...enrolledAccountIds(state.capabilities ?? [], room.id)]);
}

function teachesStudent(state, teacherId, studentId) {
  return classroomsForTeacher(state.classrooms ?? [], teacherId, state.capabilities ?? []).some((room) =>
    rosterFor(state, room).has(studentId),
  );
}

function studentHasTeacher(state, studentId, teacherId) {
  return classroomsForStudent(state.classrooms ?? [], studentId, state.capabilities ?? []).some(
    (room) => room.teacherId === teacherId,
  );
}

// The private academy name a viewer is authorized to read for `subjectId`, or
// null. Authorization is decided from the class relationship, not the viewer's
// role label, so a teacher whose role field is stale still works. A person may
// read their own; an assigned teacher may read an enrolled student's name; an
// enrolled student may read an assigned teacher's name only under the
// `class_participants` policy. An owner/admin is operational authority, not
// blanket access (docs/architecture/data-model.md): a directory grant is
// required and is not modeled yet, so an owner who does not teach the class
// gets nothing here. Callers fall back to the public alias — never to a
// redacted structured field.
export function visiblePrivateName(state, viewer, subjectId) {
  if (!state || !viewer || !subjectId) return null;
  const profile = state.privateNames?.[subjectId];
  if (!hasPrivateName(profile)) return null;
  if (viewer.id === subjectId) return formatPrivateName(profile);

  if (teachesStudent(state, viewer.id, subjectId)) {
    return canReadPrivateName(profile, { viewerId: viewer.id, subjectId, relationship: NAME_VIEWER.ASSIGNED_TEACHER })
      ? formatPrivateName(profile)
      : null;
  }

  if (studentHasTeacher(state, viewer.id, subjectId)) {
    return canReadPrivateName(profile, { viewerId: viewer.id, subjectId, relationship: NAME_VIEWER.CLASS_PARTICIPANT })
      ? formatPrivateName(profile)
      : null;
  }

  return null;
}

// Label for a person in an authorized view: the private name when available,
// otherwise the public alias.
export function learnerDisplayName(state, viewer, subjectId) {
  return visiblePrivateName(state, viewer, subjectId) ?? getPersona(subjectId).displayName ?? '';
}
