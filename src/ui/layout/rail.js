import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import {
  SUBMISSION_STATUS,
  classroomsForAcademy,
  classroomsForStudent,
  classroomsForTeacher,
  homeworkForStudent,
} from '../../domain/classroom.js';
import { pendingRequestCount, ROLE, normalizeRole } from '../../domain/school.js';
import { t } from '../../services/i18n/index.js';
import { button, widget } from '../components/primitives.js';

function healthyRelays(relays) {
  const healthy = relays.filter((relay) => relay.health === 'connected').length;
  return t('nav.relaysHealthy', { healthy, total: relays.length });
}

export function renderRail({ state, app }) {
  const persona = getPersona(state.personaId);
  const role = normalizeRole(persona.role);
  const relays = el('p', {}, healthyRelays(state.relays));

  if (role === ROLE.TEACHER) {
    const classes = classroomsForTeacher(state.classrooms ?? [], persona.id, state.capabilities ?? []);
    const ids = new Set(classes.map((room) => room.id));
    const toGrade = (state.submissions ?? []).filter(
      (submission) => ids.has(submission.classroomId) && submission.status === SUBMISSION_STATUS.SUBMITTED,
    ).length;
    return el('div', { class: 'rail__stack' }, [
      widget(t('nav.myClasses'), el('p', {}, t('nav.classesAssigned', { count: classes.length }))),
      widget(t('nav.toScore'), [
        el(
          'p',
          {},
          toGrade
            ? t(toGrade === 1 ? 'nav.submissionOne' : 'nav.submissionMany', { count: toGrade })
            : t('nav.nothingWaiting'),
        ),
        button(t('nav.openClasses'), { small: true, onClick: () => app.navigate('/role') }),
      ]),
      widget(t('nav.relays'), relays),
    ]);
  }

  if (role === ROLE.OWNER) {
    const academy = state.academies?.[persona.id];
    const classes = academy ? classroomsForAcademy(state.classrooms ?? [], academy.id) : [];
    const requests = pendingRequestCount(state.joinRequests, state.enrollRequests);
    return el('div', { class: 'rail__stack' }, [
      widget(t('nav.academy'), el('p', {}, academy ? academy.name : t('nav.noAcademy'))),
      widget(t('nav.classrooms'), [
        el('p', {}, t(classes.length === 1 ? 'nav.classroomOne' : 'nav.classroomMany', { count: classes.length })),
        button(t('nav.openOrganization'), { small: true, onClick: () => app.navigate('/role') }),
      ]),
      widget(t('nav.requests'), [
        el('p', {}, requests ? t('nav.requestsWaiting', { count: requests }) : t('nav.nothingPending')),
        button(t('nav.review'), { small: true, onClick: () => { app.setOrgTab('enrollment'); app.navigate('/role'); } }),
      ]),
      widget(t('nav.relays'), relays),
    ]);
  }

  const classes = classroomsForStudent(state.classrooms ?? [], persona.id, state.capabilities ?? []);
  const homework = homeworkForStudent(
    state.homework ?? [],
    state.classrooms ?? [],
    persona.id,
    state.capabilities ?? [],
  );
  return el('div', { class: 'rail__stack' }, [
    widget(t('nav.myClasses'), el('p', {}, t('nav.classesEnrolled', { count: classes.length }))),
    widget(t('nav.homework'), [
      el(
        'p',
        {},
        t(homework.length === 1 ? 'nav.assignmentOne' : 'nav.assignmentMany', { count: homework.length }),
      ),
      button(t('nav.open'), { small: true, onClick: () => app.navigate('/role') }),
    ]),
    widget(t('nav.relays'), relays),
  ]);
}
