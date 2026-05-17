# AV Content Planner - Project Context

## Project Overview
AV Content Planner is a professional Single Page Application (SPA) designed for the internal management of audiovisual content for marketing teams. It follows a **Sovereign-Tech** philosophy, ensuring all data and assets are locally or self-hosted.

### Core Features
- **Sovereign Backend:** Fully integrated with Google Sheets via custom Apps Script API. Zero dependence on Firebase.
- **Manual Persistence:** Data is pulled on load and only pushed to the cloud when manually saved, preventing data loss during active editing.
- **Professional Script Editor:** Specialized tools for Scene Cuts, high-contrast highlighting, and standard script formatting. Support for Ctrl+Z.
- **Visual Register:** Integrated storyboard engine with image compression and lightbox.
- **High-Fidelity Export:** Pixel-perfect PDF generation (PNG-based) and native system sharing.

## Technical Stack
- **Frontend:** HTML5, Tailwind CSS, Vite (Build Tool).
- **Backend/Persistence:** Google Sheets (via Google Apps Script Web App API).
- **Assets:** Localized fonts (`Montserrat`, `JetBrains Mono`) - 0% external CDN dependency.
- **Libraries:** `jspdf`, `html2canvas` for document export.

## Key Files
- `index.html`: Application entry point.
- `src/main.js`: Core sovereign logic, routing, and manual persistence adapter.
- `src/style.css`: UI/UX design tokens and component styling.
- `public/fonts/`: Localized brand typography assets.

## Development Conventions
- **Sovereign-First:** Never add external cloud dependencies (CDNs, SaaS APIs) without a local fallback or bridge.
- **Design Philosophy:** Professional SaaS aesthetic with high contrast, 2px borders, and Montserrat-based hierarchy.
- **Deployment:** Optimized for Vercel/GitHub Pages with environment variable support for the Sheets API URL.

## Agent Persona & Specialized Standards
### Persona: Sovereign Full-Stack Architect
1. **IP Protection:** All data must reside in the user's controlled infrastructure (Drive/Sheets).
2. **Performance:** Bundle size must be kept minimal (Firebase removal reduced bundle from ~400KB to ~35KB).
3. **UX Integrity:** UI must be localized to Spanish. Use "Actualización Optimista" for all local edits.

### Specialized Workflows
- **PDF Logic:** Always use the `html2canvas` snapshot method in `src/main.js` to ensure visual parity.
- **Manual Sync:** Ensure every editable section has a dedicated "GUARDAR" button that triggers the Sheets POST action.

## Contextual Note
This project achieved full technological sovereignty in May 2026 by removing Firebase and migrating to a Google Sheets-backed architecture, ensuring complete control over production intellectual property.
---
Repository: `https://github.com/Vladivostok214/av-planner`
