import { createElement, store } from '../../src/index.js';

setInterval(() => {
  const { lobbyState } = store.getState();
  if (!lobbyState?.timeLeft) return;
  store.setState({ lobbyState: { ...lobbyState, timeLeft: lobbyState.timeLeft - 1 } });
}, 1000);

export function Lobby () {
  const { lobby, lobbyState } = store.getState();
  const players     = lobby.players || [];
  const slotsFilled = players.length;
  const slotsNeeded = lobbyState?.required ?? 2;
  const secs        = lobbyState?.timeLeft ?? '-';

  return createElement(
    'div',
    { class:'lobby' },
    createElement('h2', {}, `Waiting room – ${slotsFilled}/${slotsNeeded}`),
    createElement('p',  {}, `Starting in ${secs}s`),
    createElement('ul', {},
      ...players.map(p => createElement('li', {}, p.nick))
    )
  );
}