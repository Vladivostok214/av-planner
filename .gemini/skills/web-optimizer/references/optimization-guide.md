# Frontend Optimization & UI/UX Best Practices

Use this reference to ensure code follows modern performance standards and aesthetic principles.

## 1. Code Optimization (Vite/Tailwind)
- **PurgeCSS**: Always use Tailwind's built-in JIT engine (enabled by default in v3+).
- **Code Splitting**: Utilize dynamic imports `import()` for large modules or routes.
- **Asset Optimization**: Ensure images are in Next-gen formats (WebP/AVIF) and appropriately sized.
- **Tree Shaking**: Prefer ES modules and named imports over default exports.

## 2. UI/UX Principles (AV Planner Context)
- **Visual Hierarchy**: Use Tailwind's spacing and font-weight scales to guide the user's eye.
- **Interactive Feedback**: Add `:hover`, `:active`, and `:focus` states to all interactive elements.
- **Accessibility (A11y)**: 
    - Use semantic HTML (`<main>`, `<nav>`, `<header>`).
    - Ensure contrast ratios meet WCAG AA standards.
    - Add `aria-label` to icon-only buttons.
- **Responsive Design**: Prioritize mobile-first with Tailwind's `md:`, `lg:` prefixes.

## 3. Performance Metrics
- **Lighthouse Goals**: Aim for 90+ in Performance, Accessibility, Best Practices, and SEO.
- **CLS (Cumulative Layout Shift)**: Always set `width` and `height` attributes on images.
- **LCP (Largest Contentful Paint)**: Prioritize loading the hero section.
