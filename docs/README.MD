# NJABERI Framework Documentation

A lightweight JavaScript framework that abstracts the DOM, handles state management, and provides event handling and routing capabilities.

## Features of the Framework

SimpleDom offers four core features:

1. **DOM Abstraction**: Creates a virtual representation of the DOM that can be manipulated before updating the actual DOM
2. **State Management**: Provides a centralized store for application state with subscription-based updates
3. **Event Handling**: Simplifies attaching and managing event listeners on DOM elements
4. **Routing System**: Enables navigation between different views without page reloads

## How to Use SimpleDom

### Creating Elements

In SimpleDom, elements are created using the `createElement` function, which converts a JavaScript object representation into DOM elements:

```javascript
// Basic element creation
const div = createElement('div', {}, 'This is a div');

// Creating an element with attributes
const header = createElement('h1', { class: 'title', id: 'main-title' }, 'Hello World');

// Creating an input element
const nameInput = createElement('input', {
  type: 'text',
  placeholder: 'Insert Name',
  id: 'name-input'
});
```

### Adding Events to Elements

Events are added as attributes with the `on` prefix:

```javascript
// Button with a click event
const button = createElement('button', {
  onclick: () => alert('Button clicked')
}, 'Click me');

// Input with input event
const input = createElement('input', {
  type: 'text',
  oninput: (e) => console.log('Value changed:', e.target.value)
});

// Form with submit event
const form = createElement('form', {
  onsubmit: (e) => {
    e.preventDefault();
    console.log('Form submitted');
  }
}, 'Form content here');
```

### Nesting Elements

Elements can be nested by passing child elements as arguments:

```javascript
// Creating a form with nested elements
const loginForm = createElement('div', { class: 'nameSubm' },
  createElement('input', {
    type: 'text',
    placeholder: 'Insert Name'
  }),
  createElement('input', {
    type: 'submit',
    placeholder: 'Submit',
    onclick: () => console.log('Form submitted')
  })
);

// More complex nesting example
const navbar = createElement('nav', { class: 'navbar' },
  createElement('div', { class: 'navbar-brand' }, 'MyApp'),
  createElement('ul', { class: 'navbar-menu' },
    createElement('li', {}, createElement('a', { href: '#' }, 'Home')),
    createElement('li', {}, createElement('a', { href: '#about' }, 'About')),
    createElement('li', {}, createElement('a', { href: '#contact' }, 'Contact'))
  )
);
```

### Adding Attributes to Elements

Attributes are specified as an object in the second parameter:

```javascript
// Basic attributes
const link = createElement('a', {
  href: 'https://example.com',
  target: '_blank',
  class: 'external-link'
}, 'Visit Example');

// Style attributes
const styledDiv = createElement('div', {
  style: {
    color: 'red',
    backgroundColor: '#f0f0f0',
    padding: '10px',
    border: '1px solid black'
  }
}, 'This div has inline styles');

// Data attributes
const dataElement = createElement('div', {
  'data-id': '123',
  'data-user': 'john'
}, 'Element with data attributes');

// Boolean attributes
const requiredInput = createElement('input', {
  type: 'text',
  required: true,
  disabled: false
});
```

## DOM Abstraction Example

This example demonstrates how SimpleDom converts HTML structure into a JavaScript object representation and then back to DOM elements:

HTML Structure:
```html
<div class="nameSubm">
  <input type="text" placeholder="Insert Name" />
  <input type="submit" placeholder="Submit" />
</div>
```

SimpleDom Representation:
```javascript
// Object representation
const formObject = {
  tag: 'div',
  attrs: {
    class: 'nameSubm'
  },
  children: [
    {
      tag: 'input',
      attrs: {
        type: 'text',
        placeholder: 'Insert Name'
      }
    },
    {
      tag: 'input',
      attrs: {
        type: 'submit',
        placeholder: 'Submit'
      }
    }
  ]
};

// Creating the same structure with SimpleDom
const form = createElement('div', { class: 'nameSubm' },
  createElement('input', {
    type: 'text',
    placeholder: 'Insert Name'
  }),
  createElement('input', {
    type: 'submit',
    placeholder: 'Submit'
  })
);
```

## Why It Works This Way

### Virtual DOM Implementation

SimpleDom uses a virtual DOM pattern to improve rendering performance:

1. **What is the Virtual DOM?**: The Virtual DOM is a lightweight JavaScript representation of the actual DOM.

2. **How it works**:
   - When you create elements with `createElement`, it builds a tree of virtual nodes (VNodes)
   - Each VNode contains information about the tag, attributes, and children
   - The `render` method converts this virtual tree into actual DOM elements

3. **Benefits**:
   - Minimizes direct DOM manipulation, which is slow
   - Allows for batching multiple updates
   - Makes it easier to track changes

### State Management Approach

The state management system is designed for predictability and ease of use:

1. **Centralized store**: All application state lives in a single store, making it easy to track and debug.

2. **Reactive updates**: When state changes, subscribers are notified, allowing components to update.

3. **Immutable updates**: State is updated by creating new objects rather than modifying existing ones, which helps prevent bugs.

### Event Handling System

SimpleDom's event system uses a direct approach for simplicity:

1. **Event attributes**: Events are specified as attributes with the `on` prefix (e.g., `onclick`).

2. **Direct binding**: Events are bound directly to the DOM elements during rendering.

3. **Clean syntax**: This approach provides a clean and intuitive API for handling user interactions.

### Routing Implementation

The routing system enables single-page application navigation:

1. **URL-based routing**: Routes are defined based on URL patterns.

2. **History API**: Uses the browser's History API to change URLs without page reloads.

3. **Parameter support**: Supports dynamic route parameters (e.g., `/user/:id`).

## Complete Working Example

Here's a complete example of a simple todo app using all features of SimpleDom:

```javascript
import { createApp, createElement, store } from './src/index.js';

// Initialize state
store.setState({
  todos: [],
  newTodo: ''
});

// Event handlers
function updateNewTodo(e) {
  store.setState({ newTodo: e.target.value });
}

function addTodo() {
  const { todos, newTodo } = store.getState();
  if (newTodo.trim()) {
    store.setState({
      todos: [...todos, { id: Date.now(), text: newTodo, completed: false }],
      newTodo: ''
    });
  }
}

function toggleTodo(id) {
  const { todos } = store.getState();
  store.setState({
    todos: todos.map(todo => 
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    )
  });
}

function removeTodo(id) {
  const { todos } = store.getState();
  store.setState({
    todos: todos.filter(todo => todo.id !== id)
  });
}

// Component
function TodoApp() {
  const { todos, newTodo } = store.getState();
  
  return createElement('div', { class: 'todo-app' },
    createElement('h1', {}, 'Todo List'),
    
    // Input form
    createElement('div', { class: 'add-todo' },
      createElement('input', {
        type: 'text',
        placeholder: 'Add new todo',
        value: newTodo,
        oninput: updateNewTodo,
        onkeydown: (e) => e.key === 'Enter' && addTodo()
      }),
      createElement('button', { onclick: addTodo }, 'Add')
    ),
    
    // Todo list
    createElement('ul', { class: 'todo-list' },
      todos.map(todo => 
        createElement('li', { 
          key: todo.id,
          class: todo.completed ? 'completed' : ''
        },
          createElement('input', {
            type: 'checkbox',
            checked: todo.completed,
            onchange: () => toggleTodo(todo.id)
          }),
          createElement('span', {}, todo.text),
          createElement('button', {
            class: 'delete-btn',
            onclick: () => removeTodo(todo.id)
          }, '×')
        )
      )
    ),
    
    // Footer
    createElement('div', { class: 'footer' },
      createElement('span', {}, `${todos.length} items total`)
    )
  );
}

// Create and mount the app
const app = createApp('#app');

// Render function
function render() {
  app.mount(TodoApp());
}

// Subscribe to state changes
store.subscribe(render);

// Initial render
render();
```

---