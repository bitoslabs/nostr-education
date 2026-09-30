import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { getPersona } from '../../data/personas.js';
import { ROLE, normalizeRole } from '../../domain/school.js';
import { renderEducation } from './education.js';
import { renderOrganization } from './organization.js';
import { renderTeaching } from './teaching.js';

function screenFor(ctx, role) {
  if (role === ROLE.TEACHER) return renderTeaching(ctx);
  if (role === ROLE.OWNER) return renderOrganization(ctx);
  return renderEducation(ctx);
}

export function renderRole(ctx) {
  // A role change (creating an academy, accepting a teacher invite) must swap
  // the workspace even when the user is already sitting on /role, so the host
  // re-dispatches whenever the persona's role changes.
  const host = el('div');
  let mounted = null;

  return bindScreen(ctx.state, host, (snapshot) => {
    const role = normalizeRole(getPersona(snapshot.personaId).role);
    if (role === mounted) return;
    mounted = role;
    host.replaceChildren(screenFor(ctx, role));
  });
}
