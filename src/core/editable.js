import { createElement } from './dom.js';
import { store } from './state.js';

// Initialize editing state in the global store
if (!store.getState().editing) {
  store.setState({ editing: null });
}

export function createEditableElement(text, onUpdate, attrs = {}) {
  const id = attrs.id || `editable-${Date.now()}`;
  const { editing } = store.getState();
  const isEditing = editing === id;
  
  const startEditing = () => store.setState({ editing: id });
  
  const stopEditing = (newText) => {
    onUpdate(newText);
    store.setState({ editing: null });
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      stopEditing(e.target.value);
    } else if (e.key === 'Escape') {
      store.setState({ editing: null });
    }
  };
  
  if (isEditing) {
    return createElement('input', {
      ...attrs,
      value: text,
      autofocus: true,
      onblur: (e) => stopEditing(e.target.value),
      onkeydown: handleKeyDown
    });
  }
  
  return createElement('span', {
    ...attrs,
    ondblclick: startEditing
  }, text);
}