import { ROLE } from './school.js';

// Academy-scoped structured name. Per docs/architecture/data-model.md
// ("Public alias and private academy name") this is the school-record name, not
// the public kind:0 alias. It must never be published to a public relay; the
// prototype keeps it on-device until the private API exists.
export const NAME_VISIBILITY = Object.freeze({
  SELF_AND_STAFF: 'self_and_authorized_staff',
  CLASS_PARTICIPANTS: 'class_participants',
});

export const NAME_VISIBILITY_VALUES = Object.freeze(Object.values(NAME_VISIBILITY));

export const GENDERS = Object.freeze(['female', 'male']);

const GENDER_VALUES = new Set(GENDERS);

// Recommended defaults from the data model: teachers use `class_participants`
// so learners can identify their assigned teacher; students stay on the most
// restrictive value and never expose their name to other students.
export function defaultNameVisibility(role) {
  return role === ROLE.TEACHER ? NAME_VISIBILITY.CLASS_PARTICIPANTS : NAME_VISIBILITY.SELF_AND_STAFF;
}

export function emptyPrivateName(role) {
  return {
    gender: '',
    givenName: '',
    familyName: '',
    visibility: defaultNameVisibility(role),
    updatedAt: null,
  };
}

export function normalizePrivateName(input = {}, { role } = {}) {
  return {
    gender: GENDER_VALUES.has(input.gender) ? input.gender : '',
    honorific: String(input.honorific ?? '').trim().slice(0, 16),
    givenName: String(input.givenName ?? '').trim().slice(0, 80),
    familyName: String(input.familyName ?? '').trim().slice(0, 80),
    visibility: NAME_VISIBILITY_VALUES.includes(input.visibility)
      ? input.visibility
      : defaultNameVisibility(role),
  };
}

export function validatePrivateName(input = {}) {
  const errors = {};
  if (!String(input.givenName ?? '').trim()) errors.givenName = 'required';
  if (!String(input.familyName ?? '').trim()) errors.familyName = 'required';
  return { valid: Object.keys(errors).length === 0, errors };
}

// Title for the rendered academy name: an explicit honorific wins, otherwise
// derive Mr/Ms from gender. No gender or honorific renders the bare name.
export function honorificFor(profile = {}) {
  const explicit = String(profile.honorific ?? '').trim();
  if (explicit) return explicit;
  if (profile.gender === 'female') return 'Ms';
  if (profile.gender === 'male') return 'Mr';
  return '';
}

// Render the structured name for display, e.g. `Mr Alex Sunder`.
export function formatPrivateName(profile = {}) {
  const name = [profile.givenName, profile.familyName]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const honorific = honorificFor(profile);
  return [honorific, name].filter(Boolean).join(' ');
}

export function hasPrivateName(profile) {
  return Boolean(profile && (String(profile.givenName ?? '').trim() || String(profile.familyName ?? '').trim()));
}

// Viewer relationships from the name read rules in docs/architecture/data-model.md.
export const NAME_VIEWER = Object.freeze({
  SELF: 'self',
  STAFF: 'staff',
  ASSIGNED_TEACHER: 'assigned_teacher',
  CLASS_PARTICIPANT: 'class_participant',
  PUBLIC: 'public',
});

// A viewer may read the structured name only for an authorized relationship.
// An assigned teacher may read an enrolled student's name; a class participant
// only unlocks an assigned teacher's name and never another student's.
// `STAFF` means a caller has already verified an explicit directory-management
// permission (audited); it is not implied by the owner/admin role alone.
export function canReadPrivateName(profile, { viewerId, subjectId, relationship } = {}) {
  if (!profile) return false;
  if (viewerId && subjectId && viewerId === subjectId) return true;
  if (relationship === NAME_VIEWER.SELF || relationship === NAME_VIEWER.STAFF) return true;
  if (relationship === NAME_VIEWER.ASSIGNED_TEACHER) return true;
  if (relationship === NAME_VIEWER.CLASS_PARTICIPANT) {
    return profile.role === ROLE.TEACHER && profile.visibility === NAME_VISIBILITY.CLASS_PARTICIPANTS;
  }
  return false;
}

