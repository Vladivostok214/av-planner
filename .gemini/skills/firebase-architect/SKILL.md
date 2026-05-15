---
name: firebase-architect
description: Expert guidance for Firebase and Firestore integration within the AV Planner Project. Use this skill when modifying database schemas, security rules, authentication flows, or performing data migrations.
---

# Firebase Architect Skill

Specialized workflow for managing the backend of the AV Planner Project.

## Core Workflows

### 1. Firestore Schema Management
- **Path Structure**: `artifacts/${appId}/public/data/projects`
- **Fields**: Ensure all projects have `title`, `status`, `category`, `description`, `script`, and `createdAt`.
- **Validation**: Before adding fields, verify impact on existing UI components.

### 2. Authentication Flow
- **Anonymity**: Support anonymous sign-in as a fallback.
- **Custom Tokens**: Handle `__initial_auth_token` if provided via the environment.

### 3. Security & Best Practices
- **Real-time Listeners**: Always use `onSnapshot` for collaborative views.
- **Writes**: Ensure all writes are wrapped in `try/catch` and provide user feedback.

## References
- See `index.html` (original or main) for the current initialization logic.
- The `appId` defaults to `av-planner-default`.
