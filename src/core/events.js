export class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    
    // Return unsubscribe function
    return () => {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    };
  }

  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(...args));
    }
  }
}

// Initialize DOM events
export function initDOMEvents(rootElement) {
  const eventTypes = ['click', 'input', 'change', 'submit', 'keydown', 'keyup', 'mouseover', 'mouseout'];
  
  eventTypes.forEach(eventType => {
    rootElement.addEventListener(eventType, (e) => {
      // Events are handled directly through the DOM now, no need for delegation
    });
  });
}