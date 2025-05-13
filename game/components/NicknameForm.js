import { createElement, store } from '../../src/index.js';

export function NicknameForm() {
  let { nicknameDraft = '' } = store.getState();

  const saveDraft = txt => store.setState({ nicknameDraft: txt });

  const submit = e => {
    e.preventDefault();
    const nick = store.getState().nicknameDraft.trim().slice(0, 20);
    if (!nick) return;

    /* remember nickname & switch to lobby UI */
    store.setState({ nickname: nick, gameState: 'lobby' });

    /* send “join” when socket is ready */
    const ws = store.getState().socket;
    const sendJoin = () => ws.send(JSON.stringify({ type: 'join', nick }));
    ws.readyState === WebSocket.OPEN
      ? sendJoin()
      : ws.addEventListener('open', sendJoin, { once: true });

    /* clear draft */
    saveDraft('');
  };

  /* build controlled input */
  const input = createElement('input', {
    type: 'text',
    placeholder: 'enter nickname…',
    value: nicknameDraft,
    oninput: e => saveDraft(e.target.value)
  });

  /* re-focus after every render so the cursor never jumps */
  setTimeout(() => {
    const el = document.querySelector('.nick-form input');
    if (el) {
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }, 0);

  return createElement(
    'form',
    { class: 'nick-form', onsubmit: submit },
    input,
    createElement('button', { type: 'submit' }, 'Join')
  );
}