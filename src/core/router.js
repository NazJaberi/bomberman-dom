// src/core/router.js
import { store } from './state.js';

export class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
    
    // Handle hash changes for routing
    window.addEventListener('hashchange', () => this.handleRouteChange());
  }

  addRoute(path, component) {
    this.routes.push({ path, component });
    return this;
  }

  navigate(path) {
    // For hash-based routing, we can directly set location.hash
    if (path.startsWith('/#/')) {
      window.location.hash = path.substring(2); // Remove the leading "/#"
    } else if (path.startsWith('#/')) {
      window.location.hash = path.substring(1); // Remove the leading "#"
    } else if (path === '/') {
      window.location.hash = '';
    } else {
      // For regular paths, use history API
      history.pushState(null, null, path);
      this.handleRouteChange();
    }
  }

  handleRouteChange() {
    // Get current path (support both regular paths and hash-based paths)
    const path = window.location.hash 
      ? `/#${window.location.hash}`  // Convert "#/active" to "/#/active"
      : window.location.pathname;

    const route = this.routes.find(route => {
      // Simple path matching
      if (route.path === path) return true;
      
      // For hash paths like "/#/"
      if (route.path === '/' && (path === '/#/' || path === '/#')) return true;
      
      // Support for pattern matching
      if (route.path.includes(':')) {
        const routeParts = route.path.split('/');
        const pathParts = path.split('/');
        
        if (routeParts.length !== pathParts.length) return false;
        
        const params = {};
        const match = routeParts.every((part, i) => {
          if (part.startsWith(':')) {
            params[part.slice(1)] = pathParts[i];
            return true;
          }
          return part === pathParts[i];
        });
        
        if (match) {
          route.params = params;
          return true;
        }
      }
      
      return false;
    });
    
    if (route) {
      this.currentRoute = route;
      
      // Update state with route information
      store.setState({ 
        route: {
          path,
          params: route.params || {}
        }
      });

      // Call the component function if it exists
      if (typeof route.component === 'function') {
        route.component();
      }
    }
  }

  init() {
    this.handleRouteChange();
    return this;
  }
}

export const router = new Router();