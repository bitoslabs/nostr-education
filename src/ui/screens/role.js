import { getPersona } from '../../data/personas.js';
import { ROLE } from '../../domain/school.js';
import { renderEducation } from './education.js';
import { renderOrganization } from './organization.js';
import { renderTeaching } from './teaching.js';

export function renderRole(ctx) {
  const persona = getPersona(ctx.state.val.personaId);
  if (persona.role === ROLE.TEACHER) return renderTeaching(ctx);
  if (persona.role === ROLE.OWNER) return renderOrganization(ctx);
  return renderEducation(ctx);
}
