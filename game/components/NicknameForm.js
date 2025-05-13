import { createElement, store } from '../../src/index.js';

export function NicknameForm() {
  let nick = '';

  const submit = e => {
    e.preventDefault();
    nick = nick.trim();
    if (!nick) return;

    const ws = store.getState().socket;

    const sendJoin = () =>
      ws.send(JSON.stringify({ type: 'join', nick }));

    if (ws.readyState === WebSocket.OPEN) {
      sendJoin();
    } else {
      ws.addEventListener('open', sendJoin, { once: true });
    }

    store.setState({ nickname: nick, gameState: 'lobby' });
  };

  return createElement(
    'form',
    { class: 'nick-form', onsubmit: submit },
    createElement('input', {
      type: 'text',
      placeholder: 'Enter nickname',
      required: true,
      autofocus: true,
      oninput: e => (nick = e.target.value)
    }),
    createElement('button', { type: 'submit' }, 'Join')
  );
}