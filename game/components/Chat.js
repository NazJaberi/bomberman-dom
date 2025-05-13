import { createElement, store } from '../../src/index.js';

export function Chat() {
  /* keep the draft in global state so it survives re-renders */
  let { chatMessages = [], chatDraft = '' } = store.getState();

  const saveDraft = txt =>
    store.setState({ chatDraft: txt });   // only this tiny key changes

  /* ---- send message  */
  const send = e => {
    e.preventDefault();
    const text = chatDraft.trim();
    if (!text) return;

    const ws = store.getState().socket;
    const doSend = () =>
      ws.send(JSON.stringify({ type: 'chat', text }));

    ws.readyState === WebSocket.OPEN
      ? doSend()
      : ws.addEventListener('open', doSend, { once: true });

    saveDraft('');                        // clear draft after sending
    e.target.reset();
  };

  /*  component output  */
  const input = createElement('input', {
    type       : 'text',
    placeholder: 'type message…',
    value      : chatDraft,               // restore current draft
    oninput    : e => saveDraft(e.target.value)
  });

  /* After the VNode is turned into a real DOM tree (next tick),
     put the cursor back so the user never notices the re-render. */
  setTimeout(() => {
    const el = document.querySelector('.chat-form input');
    if (el) {
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;  // caret at end
    }
  }, 0);

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
      input
    )
  );
}