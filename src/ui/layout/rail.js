import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import {
  SUBMISSION_STATUS,
  classroomsForAcademy,
  classroomsForStudent,
  classroomsForTeacher,
  homeworkForStudent,
} from '../../domain/classroom.js';
import { pendingRequestCount, ROLE } from '../../domain/school.js';
import { button, widget } from '../components/primitives.js';

function healthyRelays(relays) {
  const healthy = relays.filter((relay) => relay.health === 'connected').length;
  return `${healthy} of ${relays.length} healthy`;
}

export function renderRail({ state, app }) {
  const persona = getPersona(state.personaId);
  const relays = el('p', {}, healthyRelays(state.relays));

  if (persona.role === ROLE.TEACHER) {
    const classes = classroomsForTeacher(state.classrooms ?? [], persona.id);
    const ids = new Set(classes.map((room) => room.id));
    const toGrade = (state.submissions ?? []).filter(
      (submission) => ids.has(submission.classroomId) && submission.status === SUBMISSION_STATUS.SUBMITTED,
    ).length;
    return el('div', { class: 'rail__stack' }, [
      widget('🏫 My classes', el('p', {}, `${classes.length} assigned`)),
      widget('📥 To score', [
        el('p', {}, toGrade ? `${toGrade} submission${toGrade === 1 ? '' : 's'}` : 'Nothing waiting ✓'),
        button('Open classes', { small: true, onClick: () => app.navigate('/role') }),
      ]),
      widget('📡 Relays', relays),
    ]);
  }

  if (persona.role === ROLE.OWNER) {
    const academy = state.academies?.[persona.id];
    const classes = academy ? classroomsForAcademy(state.classrooms ?? [], academy.id) : [];
    const requests = pendingRequestCount(state.joinRequests, state.enrollRequests);
    return el('div', { class: 'rail__stack' }, [
      widget('🏫 Academy', el('p', {}, academy ? academy.name : 'No academy yet')),
      widget('🧑‍🏫 Classrooms', [
        el('p', {}, `${classes.length} classroom${classes.length === 1 ? '' : 's'}`),
        button('Open organization', { small: true, onClick: () => app.navigate('/role') }),
      ]),
      widget('👤 Requests', [
        el('p', {}, requests ? `${requests} waiting` : 'Nothing pending ✓'),
        button('Review', { small: true, onClick: () => { app.setOrgTab('enrollment'); app.navigate('/role'); } }),
      ]),
      widget('📡 Relays', relays),
    ]);
  }

  const classes = classroomsForStudent(state.classrooms ?? [], persona.id);
  const homework = homeworkForStudent(state.homework ?? [], state.classrooms ?? [], persona.id);
  return el('div', { class: 'rail__stack' }, [
    widget('🏫 My classes', el('p', {}, `${classes.length} enrolled`)),
    widget('📝 Homework', [
      el('p', {}, `${homework.length} assignment${homework.length === 1 ? '' : 's'}`),
      button('Open', { small: true, onClick: () => app.navigate('/role') }),
    ]),
    widget('📡 Relays', relays),
  ]);
}
