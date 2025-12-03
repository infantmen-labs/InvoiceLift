# InvoiceLift Frontend UI/UX Upgrade Roadmap

_Status: Draft (devnet PoC hardened backend; frontend due for professionalization)_

## 1. Current State (App/src)

- **Architecture**
  - Single-page layout in `App.tsx` stacking all flows vertically:
    - `MintInvoice`, `FundInvoice`, `Invoices`, `Portfolio`, `Marketplace`, `Admin`.
  - No client-side routing; everything is always rendered.
- **Styling**
  - Minimal global CSS in `styles.css` (font, button cursor, basic input styling).
  - Heavy use of inline `style={{ ... }}` with ad-hoc layout and spacing.
- **Components & State**
  - Each page is a large, self-contained component with local state and raw `fetch` calls.
  - Toast system (`components/Toast`) and signer mode (`state/signerMode`) are solid but unstyled/ungrouped in the UI.
- **UX**
  - No dedicated navigation or information hierarchy.
  - Forms and tables are functional but visually rough and dense.
  - Error handling is mostly inline text or alerts.

Goal: Evolve this into a **multi-page, professional UI** that a third party can use to explore the product without needing to read the code.

---

## 2. Design Principles

- **Clarity over cleverness**: Make each page focus on a single concept (Mint, Invoices, Marketplace, Portfolio, Admin).
- **Progressive disclosure**: Hide advanced/admin-only controls behind clear affordances.
- **Consistency**: Same layout, form styling, and action patterns across pages.
- **Feedback**: Clear success/error states, loading indicators, and disabled states.
- **Responsiveness**: Layouts should work on laptop and smaller screens without horizontal scroll.

---

## 3. Phase 1 — Layout, Navigation & Page Structure

**Objective**: Move from a single stacked page to a proper app shell with navigation and per-page routing.

### 3.1 Introduce App Shell & Navigation

- Create a top-level layout with:
  - **Header**: App title, environment indicator, wallet button, signer toggle.
  - **Primary navigation**: Tabs or side-nav for:
    - Dashboard (optional), Invoices, Marketplace, Portfolio, Admin.
- Use React Router or a minimal in-house router:
  - Route paths: `/`, `/invoices`, `/marketplace`, `/portfolio`, `/admin`.
  - `App.tsx` becomes: layout + `<Routes>` instead of rendering all pages inline.
- Ensure signer toggle and wallet button remain visible globally.

### 3.2 Split Flows into Focused Views

- **Mint & Fund**
  - Move `MintInvoice` and `FundInvoice` into the **Invoices** view as sections or modals.
  - Optionally: a simple **Dashboard** showing quick actions (Mint, Fund) and key metrics.
- **Invoices page**
  - Left: filter + table/list.
  - Right: detail panel for selected invoice (current behavior), but with visual grouping.
- **Marketplace page**
  - Keep table, but move filters into a distinct toolbar.
- **Admin page**
  - Split into tabs or cards: KYC, Documents, Scores.

### 3.3 Layout & Typography Baseline

- Define a small set of layout primitives (even without a full design system):
  - `Page`, `PageHeader`, `PageSection`, `Card`, `Stack`, `Inline` components.
  - Standard font sizes, weights, and colors for headings, labels, body text.
- Replace most inline styles in pages with these primitives.

---

## 4. Phase 2 — Visual Design & Component System

**Objective**: Introduce a lightweight design system and reusable components.

### 4.1 Styling Strategy

- Option A (recommended): **TailwindCSS**
  - Pros: Fast iteration, small component layer, works well with Vite.
  - Use utility classes for layout + spacing, and build a few composite components.
- Option B: CSS Modules + a small token file (colors, spacing, border radius).

Pick one and:
- Define a color palette (neutral, success, error, warning, accent).
- Define spacing scale (4/8/12/16/24/32) and radii.

### 4.2 Shared Components

Prioritized component backlog:

- **Buttons**
  - Variants: primary, secondary, subtle, destructive.
  - Sizes: default, small.
  - Loading state (+ spinner) and disabled state.

- **Inputs & Forms**
  - `TextField`, `NumberField`, `Select`, `Textarea` with consistent label/description/error styling.
  - Generic `Form` layout helper to align labels and fields.

- **Cards & Panels**
  - `Card` component used for invoice details, marketplace rows, admin blocks.

- **Table/Grid**
  - Light abstraction for simple, responsive tables with header, row, and empty states.

- **Modals & Drawers** (optional but valuable)
  - For flows like “Create Listing”, “Approve Allowance”, “Cancel Listing”.

- **Badges/Tags**
  - For invoice status, listing status, KYC status, risk labels.

### 4.3 Toast & Status Styling

- Enhance `Toast` visuals to match the new design system.
- Add a global loading spinner / skeleton states for key tables.

---

## 5. Phase 3 — UX Improvements per Page

**Objective**: Make each core flow intuitive and self-explanatory.

### 5.1 Invoices

- **Invoice list**
  - Improve filters: status filter, seller/investor filter, search by invoice ID.
  - Add sorting (by created date, amount, status).
- **Invoice detail**
  - Group information into sections: Metadata, Amounts, Positions, Listings, Documents, Credit Score.
  - Show KYC and risk labels near seller / invoice header if present.
- **Mint & Fund flows**
  - Use form components; add inline validation (required fields, number ranges).
  - Show clear messaging about Backend vs Wallet mode and who signs.

### 5.2 Marketplace

- Clarify **Seller** vs **Buyer** actions:
  - When wallet matches listing seller: highlight seller controls.
  - When wallet differs: emphasize buyer controls.
- Show computed totals: `qty * price` in USDC for the input qty.
- Display allowance summary more clearly:
  - Show delegate and current allowance with tooltips / structured layout.
- Empty state & errors:
  - Friendly messages for “no listings”, network errors.

### 5.3 Portfolio

- Improve layout with cards per invoice or a table with richer data:
  - Include current price hints (if any listings exist).
  - Link to invoice detail (in-app) as well as explorer.

### 5.4 Admin

- Replace raw `alert()` calls with toasts.
- Add clear warnings that actions are **admin-only** and affect the sandbox.
- Provide simple presets / templates for payload JSON.

---

## 6. Phase 4 — Wallet, Network & Environment UX

**Objective**: Make network / environment and roles obvious.

- Show **environment pill** in header: `devnet` + program ID short.
- Show **role**: Admin vs Regular user; hide backend-only flows for non-admins.
- Improve messaging when wallet not connected:
  - Replace errors with inline prompts and disabled buttons.
- Add a small **"Debug" panel** (optional) for developers:
  - Show backend URL, feature flags (V2 allowance on/off), LISTINGS_REQUIRE_SIG.

---

## 7. Phase 5 — Code Structure, Types & Testing

**Objective**: Harden frontend code quality as UI grows.

- **API layer**
  - Create a small `api` module for backend calls with typed responses (based on backend schemas/IDL).
  - Centralize backend URL and error handling.
- **Shared utilities**
  - Move formatting helpers (`fmt6`, date formatting, base64 helpers) into shared modules.
- **Testing**
  - Add a minimal set of **React Testing Library** tests for key flows (render + happy path).
  - Optional: Storybook for core components (Button, Card, Toast, Form fields).

---

## 8. Suggested Implementation Order

1. **Phase 1**: Routing + app shell + basic page layout.
2. **Phase 2**: Design system & shared components (buttons, forms, cards, tables).
3. **Phase 3**: Per-page UX improvements (Invoices, Marketplace, Portfolio, Admin).
4. **Phase 4**: Wallet/network/role UX and environment indicators.
5. **Phase 5**: API layer, shared utilities, tests, and Storybook.

Each phase can be broken into small PRs (e.g., "Introduce routing", "Refactor Invoices page layout", "Add Button + Card components", etc.) to keep changes reviewable and safe.
