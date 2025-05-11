// src/index.js
import { createElement, VNode } from './core/dom.js';
import { Store, store } from './core/state.js';
import { EventEmitter, initDOMEvents } from './core/events.js';
import { Router, router } from './core/router.js';
import { createEditableElement } from './core/editable.js';

// Create and initialize the app
export function createApp(rootSelector) {
  const rootElement = document.querySelector(rootSelector);
  
  if (!rootElement) {
    throw new Error(`Root element ${rootSelector} not found`);
  }
  
  // Initialize DOM event handling
  initDOMEvents(rootElement);
  
  return {
    mount(component) {
      rootElement.innerHTML = '';
      if (component instanceof VNode) {
        rootElement.appendChild(component.render());
      } else if (typeof component === 'function') {
        const vnode = component();
        rootElement.appendChild(vnode.render());
      } else {
        rootElement.appendChild(component);
      }
    },
    use(plugin) {
      plugin(this);
      return this;
    },
    router,
    store
  };
}

// Export framework API
export {
  createElement,
  Store,
  store,
  EventEmitter,
  Router,
  router,
  VNode,
  createEditableElement
};