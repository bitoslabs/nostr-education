import { el } from '../../core/dom.js';
import {
  GENDERS,
  NAME_VISIBILITY,
  NAME_VISIBILITY_VALUES,
  normalizePrivateName,
  validatePrivateName,
} from '../../domain/private-name.js';
import { ROLE } from '../../domain/school.js';
import { t } from '../../services/i18n/index.js';
import { button, noteBox } from './primitives.js';
import { formFoot, formSection, setWorking } from './form-fields.js';

export function renderPrivateName({ profile, role, actions, close }) {
  const current = normalizePrivateName(profile ?? {}, { role });

  const genderSelect = el(
    'select',
    { id: 'private-name-gender' },
    GENDERS.map((id) =>
      el('option', { value: id, selected: id === current.gender }, t(`credentials.privateName.gender.${id}`)),
    ),
  );
  // Gender stays optional: with only Female/Male offered, a fresh profile shows
  // no preselection instead of silently defaulting to the first option.
  if (!current.gender) genderSelect.selectedIndex = -1;
  const givenInput = el('input', {
    id: 'private-name-given',
    type: 'text',
    value: current.givenName,
    autocomplete: 'given-name',
    maxlength: '80',
  });
  const familyInput = el('input', {
    id: 'private-name-family',
    type: 'text',
    value: current.familyName,
    autocomplete: 'family-name',
    maxlength: '80',
  });
  const visibilitySelect = el(
    'select',
    { id: 'private-name-visibility' },
    NAME_VISIBILITY_VALUES.map((id) =>
      el('option', { value: id, selected: id === current.visibility }, t(`credentials.privateName.visibility.${id}`)),
    ),
  );

  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });
  const cancel = button(t('common.actions.cancel'), { onClick: close });
  const submitLabel = t('credentials.privateName.save');
  const submit = button(submitLabel, { variant: 'gold', type: 'submit' });

  const run = async () => {
    const fields = {
      gender: genderSelect.value,
      givenName: givenInput.value,
      familyName: familyInput.value,
      visibility: visibilitySelect.value,
    };
    const check = validatePrivateName(fields);
    if (!check.valid) {
      error.textContent = t('credentials.privateName.required');
      (check.errors.givenName ? givenInput : familyInput).focus();
      return;
    }
    error.textContent = '';
    setWorking(submit, true, submitLabel);
    const ok = await actions.savePrivateName({ ...fields, role });
    setWorking(submit, false, submitLabel);
    if (ok) close();
  };

  return el('div', {}, [
    el('h2', {}, t('credentials.privateName.title')),
    el('p', { class: 'muted small' }, t('credentials.privateName.subtitle')),
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          run();
        },
      },
      [
        formSection(t('credentials.privateName.sectionName'), [
          el('label', { for: 'private-name-gender' }, t('credentials.privateName.genderLabel')),
          genderSelect,
          el('label', { for: 'private-name-given' }, t('credentials.privateName.givenLabel')),
          givenInput,
          el('label', { for: 'private-name-family' }, t('credentials.privateName.familyLabel')),
          familyInput,
        ]),
        formSection(t('credentials.privateName.sectionPrivacy'), [
          el('label', { for: 'private-name-visibility' }, t('credentials.privateName.visibilityLabel')),
          visibilitySelect,
          el(
            'p',
            { class: 'field-hint' },
            role === ROLE.TEACHER
              ? t('credentials.privateName.visibilityTeacherHint')
              : t('credentials.privateName.visibilityStudentHint'),
          ),
        ]),
        error,
        noteBox(t('credentials.privateName.note'), 'warn'),
        formFoot([cancel, submit]),
      ],
    ),
  ]);
}
