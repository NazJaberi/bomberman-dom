import { createApp, createElement, store, router, createEditableElement } from '../src/index.js';

// Initialize the app state
store.setState({
  todos: [],
  filter: 'all'
  // Note: We don't need editing state here anymore as it's handled by the framework
});

// Event handlers
function addTodo(e) {
  if (e.key === 'Enter') {
    const text = e.target.value.trim();
    if (text) {
      const { todos } = store.getState();
      store.setState({
        todos: [...todos, {
          id: Date.now(),
          text,
          completed: false
        }]
      });
      e.target.value = '';
    }
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

function clearCompleted() {
  const { todos } = store.getState();
  store.setState({
    todos: todos.filter(todo => !todo.completed)
  });
}

function toggleAll(e) {
  const { todos } = store.getState();
  const completed = e.target.checked;
  store.setState({
    todos: todos.map(todo => ({ ...todo, completed }))
  });
}

function updateTodoText(id, newText) {
  const { todos } = store.getState();
  
  if (newText.trim() === '') {
    // If the text is empty, remove the todo
    store.setState({
      todos: todos.filter(todo => todo.id !== id)
    });
  } else {
    // Otherwise update the text
    store.setState({
      todos: todos.map(todo => 
        todo.id === id ? { ...todo, text: newText } : todo
      )
    });
  }
}

function setFilter(filter) {
  store.setState({ filter });
  router.navigate(`/#/${filter === 'all' ? '' : filter}`);
}

// Components
function TodoItem(todo) {
  return createElement('li', { 
    class: todo.completed ? 'completed' : '',
    key: todo.id 
  }, 
    createElement('div', { class: 'view' },
      createElement('input', { 
        class: 'toggle', 
        type: 'checkbox', 
        checked: todo.completed,
        onclick: () => toggleTodo(todo.id)
      }),
      // Using the framework's createEditableElement function
      createEditableElement(
        todo.text, 
        (newText) => updateTodoText(todo.id, newText),
        { 
          class: 'todo-label',
          id: `todo-${todo.id}` 
        }
      ),
      createElement('button', { 
        class: 'destroy', 
        onclick: () => removeTodo(todo.id)
      })
    )
  );
}

function TodoList() {
  const { todos, filter } = store.getState();
  
  const filteredTodos = todos.filter(todo => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });
  
  return createElement('ul', { class: 'todo-list' },
    ...filteredTodos.map(todo => TodoItem(todo))
  );
}

function Footer() {
  const { todos, filter } = store.getState();
  const activeTodoCount = todos.filter(todo => !todo.completed).length;
  const completedCount = todos.length - activeTodoCount;
  
  return createElement('footer', { class: 'footer' },
    createElement('span', { class: 'todo-count' },
      createElement('strong', {}, activeTodoCount.toString()),
      ` item${activeTodoCount !== 1 ? 's' : ''} left`
    ),
    createElement('ul', { class: 'filters' },
      createElement('li', {},
        createElement('a', { 
          class: filter === 'all' ? 'selected' : '',
          href: '#/',
          onclick: (e) => { e.preventDefault(); setFilter('all'); }
        }, 'All')
      ),
      createElement('li', {},
        createElement('a', { 
          class: filter === 'active' ? 'selected' : '',
          href: '#/active',
          onclick: (e) => { e.preventDefault(); setFilter('active'); }
        }, 'Active')
      ),
      createElement('li', {},
        createElement('a', { 
          class: filter === 'completed' ? 'selected' : '',
          href: '#/completed',
          onclick: (e) => { e.preventDefault(); setFilter('completed'); }
        }, 'Completed')
      )
    ),
    completedCount > 0 ?
      createElement('button', { 
        class: 'clear-completed',
        onclick: clearCompleted
      }, 'Clear completed')
      : null
  );
}

function TodoApp() {
  const { todos } = store.getState();
  
  return createElement('section', { class: 'todoapp' },
    createElement('header', { class: 'header' },
      createElement('h1', {}, 'todos'),
      createElement('input', {
        class: 'new-todo',
        placeholder: 'What needs to be done?',
        autofocus: true,
        onkeydown: addTodo
      })
    ),
    todos.length > 0 ? 
      createElement('section', { class: 'main' },
        createElement('input', {
          id: 'toggle-all',
          class: 'toggle-all',
          type: 'checkbox',
          checked: todos.every(todo => todo.completed),
          onclick: toggleAll
        }),
        createElement('label', { for: 'toggle-all' }, 'Mark all as complete'),
        TodoList()
      ) : null,
    todos.length > 0 ? Footer() : null
  );
}

// Create and mount the app
const app = createApp('#app');

// Setup routes
router.addRoute('/', () => {
  setFilter('all');
  return null;
});

router.addRoute('/#/active', () => {
  setFilter('active');
  return null;
});

router.addRoute('/#/completed', () => {
  setFilter('completed');
  return null;
});

// Initialize the router
router.init();

// Check the initial route
const path = window.location.hash;
if (path === '#/active') {
  setFilter('active');
} else if (path === '#/completed') {
  setFilter('completed');
} else {
  setFilter('all');
}

// Render function
function render() {
  app.mount(TodoApp());
}

// Subscribe to state changes
store.subscribe(render);

// Initial render
render();