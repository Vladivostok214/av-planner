---
name: web-optimizer
description: Optimizes frontend code for performance and applies UI/UX best practices. Use when the user wants to improve the visual quality, accessibility, or loading speed of a web application, especially those using Tailwind CSS and Vite.
---

# Web Optimizer Skill

Specialized workflow for improving frontend applications.

## Core Workflows

### 1. Code Audit & Performance
Evaluate the current codebase for bottlenecks.
- Check `package.json` for heavy dependencies.
- Inspect `vite.config.js` or `tailwind.config.js` for misconfigurations.
- Review asset loading strategies.

### 2. UI/UX Enhancement
Refine the interface based on modern design standards.
- Apply consistent spacing and typography.
- Implement interactive states (hover, focus, transitions).
- Verify mobile responsiveness.

### 3. Accessibility (A11y)
Ensure the application is usable by everyone.
- Validate semantic HTML usage.
- Check for ARIA attributes where needed.

## Reference Materials
For detailed checklists and patterns, refer to:
- [optimization-guide.md](references/optimization-guide.md): Comprehensive guide on performance and design.

## Procedural Steps
1. **Research**: Run `npm run build` or use Lighthouse (if available) to identify issues.
2. **Execution**: Apply changes surgically using the `replace` tool.
3. **Validation**: Test responsiveness and accessibility manually or via automated tests.
