export const FEED_TABS = Object.freeze([
  { id: 'foryou', label: 'For you' },
  { id: 'following', label: 'Following' },
  { id: 'latest', label: 'Latest' },
]);

export function isVisible(event, personaId) {
  if (event.audience === 'all') return true;
  return Array.isArray(event.audience) && event.audience.includes(personaId);
}

export function isActionNeededFor(event, personaId) {
  return Boolean(event.actionNeeded) && event.audience !== 'all' && isVisible(event, personaId);
}

export function filterFeed(events, { personaId, tab = 'foryou', following = [] }) {
  let list = events.filter((event) => isVisible(event, personaId));

  if (tab === 'following') {
    list = list.filter(
      (event) => event.author === personaId || following.includes(event.author),
    );
  }

  if (tab === 'foryou') {
    const priority = (event) => (isActionNeededFor(event, personaId) ? 0 : 1);
    list = [...list].sort((left, right) => priority(left) - priority(right));
  }

  return list;
}
