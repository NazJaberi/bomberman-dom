import { createElement, store } from '../../src/index.js';

export function Lobby() {
  const {
    nickname,
    lobby: { players },
    lobbyState: { phase = 'waiting', fillR = 0, readyR = 0 } = {},
    chatMessages = [],
    chatDraft = ''
  } = store.getState();

  // Fix for the chat issue - save complete draft without removing last letter
  const saveDraft = newDraft => {
    store.setState({ chatDraft: newDraft });
  };

  const sendChat = e => {
    e.preventDefault();
    const { socket, chatDraft } = store.getState();
    if (!chatDraft.trim()) return;

    socket.send(JSON.stringify({ type: 'chat', text: chatDraft }));
    saveDraft('');
  };

  return createElement(
    'div',
    { class: 'lobby-screen' },
    createElement('h1', {}, 'Lobby'),
    createElement(
      'p',
      {},
      `Hello, ${nickname}! Wait for more players to join...`
    ),
    createElement(
      'ul',
      {},
      ...players.map(p =>
        createElement('li', {}, `${p.nick}${p.id === store.getState().socketId ? ' (you)' : ''}`)
      )
    ),
    createElement(
      'div',
      { class: 'lobby-phase' },
      phase === 'waiting'
        ? 'Waiting for players…'
        : phase === 'fill'
        ? `Game starting in ${fillR}s (joining phase)`
        : phase === 'ready'
        ? `Game starting in ${readyR}s (ready phase)`
        : ''
    ),
    createElement(
      'div',
      { class: 'chat-box' },
      createElement(
        'div',
        { class: 'chat-log' },
        ...chatMessages.map(m =>
          createElement(
            'div',
            { class: 'chat-line' },
            createElement('span', { class: 'chat-nick' }, `${m.nick}: `),
            `${m.text}`
          )
        )
      ),
      createElement(
        'form',
        { class: 'chat-form', onsubmit: sendChat },
        createElement('input', {
          type: 'text',
          placeholder: 'chat message…',
          value: chatDraft,
          oninput: e => saveDraft(e.target.value)
        })
      )
    )
  );
}