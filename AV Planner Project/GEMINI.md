# AV Content Planner - Project Context

## Project Overview
AV Content Planner is a comprehensive Single Page Application (SPA) designed for the internal management and planning of audiovisual content for marketing teams. It centralizes the workflow from the initial idea/brief to final production tracking.

### Core Features
- **Real-time Dashboard:** Visualizes production metrics using dynamic charts.
- **Idea Management:** Advanced forms for capturing briefs, core themes, and initial scripts.
- **360° Detail View:** Includes an integrated script editor, interactive visual storyboard (CSS Grid-based), and video progress preview.
- **Cloud Persistence:** Automatic synchronization via Firebase/Firestore for collaborative and remote work.

## Technical Stack
- **Frontend:** HTML5, Tailwind CSS (via CDN) for a modern, responsive "Bento Box" / Material Design UI.
- **Charts:** Chart.js and Plotly.js for KPI and data visualization.
- **Backend/Persistence:** Firebase (Auth & Firestore) for real-time data synchronization.
- **Design Philosophy:** Single-file architecture (SPA) with no external SVG dependencies (using Unicode and CSS-styled icons).

## Key Files
- `index.html`: The core application file. Contains the entire UI, logic, and Firebase integration.
- `Readme.md`: Basic project introduction and setup instructions.

## Development Conventions
- **Single File Architecture:** The project is intentionally kept as a single-file SPA for simplicity and ease of deployment.
- **Iconography:** Do not use SVG files. Use Unicode icons or CSS-based styling for interactive elements.
- **Label Formatting:** Graph labels are automatically wrapped at 16 characters for optimal readability.
- **Deployment:** Optimized for hosting on GitHub Pages.

## Agent Persona & Specialized Standards
### Persona: Senior Full-Stack Architect (AV Content Specialist)
As the specialized agent for this project, you operate as a Senior Architect with a focus on high-performance marketing tools. Your goals are:
1. **Performance First:** Every change must maintain or improve Lighthouse scores.
2. **Aesthetic Rigor:** Adhere strictly to the "Bento Box" / Material Design 3 aesthetic. Use consistent rounding (`rounded-3xl`), subtle shadows, and vibrant accent colors (`#C70039`).
3. **Data Integrity:** Protect the Firebase/Firestore structure. Never modify schemas without a migration plan.

### Specialized Workflows
- **Optimization:** Use the `web-optimizer` skill for any UI/UX or performance task.
- **Review:** Use the `code-review` extension before confirming any complex logic change.
- **Security:** Run `/security:analyze` whenever adding new dependencies or modifying authentication logic.

### Design Tokens (Tailwind)
- **Primary:** `#581845` (Deep Purple)
- **Accent:** `#C70039` (Crimson)
- **Warning:** `#FF5733` (Orange)
- **Highlight:** `#FFC300` (Yellow)
- **Radius:** `rounded-2xl` for cards, `rounded-full` for buttons.

## Contextual Note
This project was initially explored and organized from a subdirectory into a dedicated "AV Planner Project" folder within the user's Documents. It is linked to the repository: `https://github.com/Vladivostok214/av-planner`.
