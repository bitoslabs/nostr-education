import { el } from '../../core/dom.js';
import { identityName, identitySecondary, isVerified } from '../../domain/identity.js';
import { avatar } from './primitives.js';

export function identityChip(person, { context, size = 32 } = {}) {
  return el('span', { class: 'chip' }, [
    avatar(person, size),
    el('span', { class: 'chip__body' }, [
      el('span', { class: 'chip__name' }, [
        identityName(person),
        isVerified(person) ? el('span', { class: 'vmark' }, '✓') : null,
      ]),
      el('span', { class: 'chip__secondary mono' }, identitySecondary(person)),
    ]),
    context ? el('span', { class: 'chip__context' }, context) : null,
  ]);
}
