export class VNode {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = children;
  }

  render() {
    // Create the DOM element
    const element = document.createElement(this.tag);
    
    // Add attributes
    Object.entries(this.attrs).forEach(([key, value]) => {
      if (key === 'style' && typeof value === 'object') {
        Object.entries(value).forEach(([prop, val]) => {
          element.style[prop] = val;
        });
      } else if (key.startsWith('on')) {
        // We'll handle events separately through our event system
        const eventName = key.slice(2).toLowerCase();
        element.setAttribute(`data-event-${eventName}`, '');
        element[key] = value; // Direct event assignment
      } else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'autofocus') {
        // Boolean attributes need special handling
        if (value) {
          element.setAttribute(key, key);
        }
      } else {
        element.setAttribute(key, value);
      }
    });
    
    // Add children
    this.children.forEach(child => {
      if (child === null || child === undefined) {
        return; // Skip null or undefined children
      }
      
      if (typeof child === 'string' || typeof child === 'number') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof VNode) {
        element.appendChild(child.render());
      } else if (child instanceof Node) {
        element.appendChild(child);
      } else if (Array.isArray(child)) {
        // Handle arrays of children
        child.forEach(nestedChild => {
          if (nestedChild instanceof VNode) {
            element.appendChild(nestedChild.render());
          } else if (typeof nestedChild === 'string') {
            element.appendChild(document.createTextNode(nestedChild));
          } else if (nestedChild instanceof Node) {
            element.appendChild(nestedChild);
          }
        });
      }
    });
    
    return element;
  }
}

// Helper function to create VNodes
export function createElement(tag, attrs = {}, ...children) {
  // Flatten nested arrays in children
  const flattenedChildren = children.flat(Infinity).filter(child => 
    child !== null && child !== undefined && child !== false
  );
  return new VNode(tag, attrs, flattenedChildren);
}