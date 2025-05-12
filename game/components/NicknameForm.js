import { createElement, store } from '../../src/index.js';

export function NicknameForm() {
  let nick = '';

  const submit = e => {
    e.preventDefault();
    nick = nick.trim();
    if (!nick) return;

    store.setState({ nickname: nick, gameState: 'lobby' });

    const { socket } = store.getState();
    socket.send(JSON.stringify({ type: 'join', nick }));
  };

  return createElement('form', { class: 'nick-form', onsubmit: submit },
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