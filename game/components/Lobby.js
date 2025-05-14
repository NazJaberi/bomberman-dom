import { createElement, store } from '../../src/index.js';
import { Chat } from './Chat.js';

export function Lobby() {
  const { lobby, lobbyState = {} } = store.getState();
  const players = lobby.players || [];
  const { phase = 'waiting', fillRemaining = 0, readyRemaining = 0 } = lobbyState;

  let phaseText = 'Waiting for players…';
  if (phase === 'fill')   phaseText = `Fill timer: ${fillRemaining}s`;
  if (phase === 'ready')  phaseText = `Game starts in ${readyRemaining}s`;

  return createElement('div', { class: 'lobby-screen' },
    createElement('h2', {}, 'Bomberman DOM – Lobby'),
    createElement('p', {}, `Players: ${players.length} / 4`),
    createElement('p', { class: 'lobby-phase' }, phaseText),
    createElement('ul', {},
      players.map(p => createElement('li', { key: p.id }, p.nick || '???'))
    ),
    Chat()
  );
}