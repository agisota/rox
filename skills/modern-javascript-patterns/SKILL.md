---
triggers:
  - "modern javascript patterns"
name: modern-javascript-patterns
description: Master ES6+ features including async/await, destructuring, spread operators, arrow functions, promises, modules, iterators, generators, and functional programming patterns for writing clean, efficient JavaScript code. Use when refactoring legacy code, implementing modern patterns, or optimizing JavaScript applications.
---

# Modern JavaScript Patterns

Comprehensive guide for mastering modern JavaScript (ES6+) features, functional programming patterns, and best practices for writing clean, maintainable, and performant code.

## When to Use This Skill

- Refactoring legacy JavaScript to modern syntax
- Implementing functional programming patterns
- Optimizing JavaScript performance
- Writing maintainable and readable code
- Working with asynchronous operations
- Building modern web applications
- Migrating from callbacks to Promises/async-await
- Implementing data transformation pipelines

## ES6+ Core Features

### 1. Arrow Functions

**Syntax and Use Cases:**
```javascript
// Traditional function
function add(a, b) {
  return a + b;
}

// Arrow function
const add = (a, b) => a + b;

// Single parameter (parentheses optional)
const double = x => x * 2;

// No parameters
const getRandom = () => Math.random();

// Multiple statements (need curly braces)
const processUser = user => {
  const normalized = user.name.toLowerCase();
  return { ...user, name: normalized };

## Note
Skill content truncated for token efficiency. Full version available in the source repository.
