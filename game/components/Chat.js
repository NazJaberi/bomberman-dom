import { createElement, store } from '../../src/index.js';

export function Chat() {
  const { chatMessages = [] } = store.getState();
  let text = '';

  const send = e => {
    e.preventDefault();
    text = text.trim();
    if (!text) return;

    const ws = store.getState().socket;
    const doSend = () =>
      ws.send(JSON.stringify({ type: 'chat', text }));

    if (ws.readyState === WebSocket.OPEN) {
      doSend();
    } else {
      ws.addEventListener('open', doSend, { once: true });
    }

    text = '';
    e.target.reset();
  };

  return createElement(
    'div',
    { class: 'chat-box' },
    createElement(
      'div',
      { class: 'chat-log' },
      chatMessages.map(m =>
        createElement(
          'div',
          { class: 'chat-line' },
          createElement('span', { class: 'chat-nick' }, `${m.nick}: `),
          createElement('span', {}, m.text)
        )
      )
    ),
    createElement(
      'form',
      { class: 'chat-form', onsubmit: send },
      createElement('input', {
        type: 'text',
        placeholder: 'type message…',
        oninput: e => (text = e.target.value)
      })
    )
  );
}