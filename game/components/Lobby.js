import { createElement, store } from '../../src/index.js';

export function Lobby() {
  const { lobby } = store.getState();
  const players = lobby.players || [];

  return createElement('div', { class: 'lobby-screen' },
    createElement('h2', {}, 'Bomberman DOM – Lobby'),
    createElement('p', {}, `Players: ${players.length} / 4`),
    createElement('ul', {},
      players.map(p => createElement('li', { key: p.id }, p.nick || '???'))
    )
  );
}