# v0 Prompt Script — InvoiceLift Frontend Upgrade

Use these prompts sequentially inside v0 (or your chosen AI UI tool) to evolve the existing frontend into a more professional, beautiful UI **without breaking backend behavior**.

Context for v0:
- Project: **InvoiceLift** (Solana invoice marketplace PoC)
- Frontend: React + Vite, TypeScript in `app/`
- Key files:
  - `app/src/App.tsx`
  - `app/src/pages/MintInvoice.tsx`
  - `app/src/pages/FundInvoice.tsx`
  - `app/src/pages/Invoices.tsx`
  - `app/src/pages/Marketplace.tsx`
  - `app/src/pages/Portfolio.tsx`
  - `app/src/pages/Admin.tsx`
  - `app/src/components/Toast.tsx`
  - `app/src/state/signerMode.tsx`
- Backend API contract must remain unchanged.

---

## Prompt 0 – Understand the Codebase & Constraints

> You are v0 working on the **InvoiceLift** frontend inside the `app/` folder of a monorepo. The backend API and on-chain logic are **already correct and tested**; your job is to upgrade the React UI so it is professional, clean, and beautiful while preserving **all existing behavior and endpoints**.
>
> Please:
> 1. Scan `app/src/App.tsx`, all files under `app/src/pages/`, `app/src/components/Toast.tsx`, and `app/src/state/signerMode.tsx`.
> 2. Summarize the current information architecture and UX problems (single-page layout, dense forms, inline styles, etc.).
> 3. Propose a high-level design direction (navigation, layout, design system, typography, color palette) suitable for a **developer/pro-sumer financial app**.
> 4. Outline a short step-by-step implementation plan (5–8 steps) that you will follow in subsequent prompts to upgrade the frontend.
>
> Do **not** change any files yet. Only respond with analysis and a concrete plan.

---

## Prompt 1 – Introduce Design System & Styling Approach

> Based on your plan, implement a lightweight but professional design system for the InvoiceLift frontend.
>
> Requirements:
> - Use **Tailwind CSS** for layout, spacing, and typography utilities with Vite + React in `app/`.
> - Configure Tailwind in the `app/` project (config files, PostCSS integration, etc.).
> - Define a coherent theme:
>   - Neutral grays for backgrounds and borders.
>   - Accent color suitable for a fintech product (e.g. blue/emerald) for primary actions.
>   - Success (green), error (red), warning (amber) tokens.
> - Create a small set of reusable UI primitives under `app/src/components/ui/`, e.g.:
>   - `Button`
>   - `Input`
>   - `Select`
>   - `Textarea`
>   - `Card`
>   - `Badge`
> - Ensure components support disabled and loading states where relevant.
>
> Important:
> - Do not remove existing business logic or API calls.
> - After changes, show the updated file list and a brief summary of what changed.

---

## Prompt 2 – App Shell, Routing & Navigation

> Implement a proper app shell with navigation and per-page routing for the InvoiceLift frontend.
>
> Requirements:
> - Introduce a lightweight routing solution into the `app/` project.
> - Refactor `app/src/App.tsx` so that:
>   - It renders a top-level layout with:
>     - Header containing: app name, environment indicator (e.g. `Devnet`), wallet connect button, signer mode toggle.
>     - Primary navigation (tabs or side-nav) for pages: Dashboard (optional), Invoices, Marketplace, Portfolio, Admin.
>   - Each of the existing page components becomes a route:
>     - `/` → Invoices (or Dashboard if you create one).
>     - `/invoices`
>     - `/marketplace`
>     - `/portfolio`
>     - `/admin`
> - Move the previously stacked content (Mint/Fund/Invoices/Portfolio/Marketplace/Admin) into appropriate routed pages; do **not** delete any functionality.
> - Apply the new design system components (Buttons, Inputs, Card, etc.) in `App.tsx` for shell and navigation.
>
> Constraints:
> - Do not change backend URLs or API shapes.
> - Preserve `SignerModeProvider` and `ToastProvider` behavior.

---

## Prompt 3 – Refactor Invoices Page UI/UX

> Refine the **Invoices** experience in `app/src/pages/Invoices.tsx` using the new design system.
>
> Objectives:
> - Make Invoices the primary workspace for the user.
> - Clearly separate **list view** and **detail panel**.
>
> Requirements:
> - Use `Card`, `Button`, `Input`, `Select`, and `Badge` components instead of inline styles where reasonable.
> - Improve the filter bar:
>   - Status dropdown (All/Open/Funded/Settled) with better styling.
>   - Wallet filter input with clear label and placeholder.
>   - Auto-refresh toggle styled as a switch or checkbox with label.
>   - Primary `Refresh` button.
> - In the invoice list:
>   - Use a responsive table or list layout that looks good on laptop widths.
>   - Highlight selected invoice.
>   - Use badges for status (Open/Funded/Settled) with color coding.
> - In the invoice detail panel:
>   - Group information into labeled sections:
>     - Overview (ids, seller, investor, status, due date).
>     - Amounts (total amount, funded amount).
>     - Links (explorer links, USDC mint, shares mint).
>     - Positions & History.
>     - Listings (including V1 & V2 actions).
>   - Make actions (init shares, fractional fund, create listing, approve, fulfill, cancel, etc.) visually distinct with clear hierarchy and spacing.
>
> Keep all existing logic and calls, just improve layout and styling using the new components.

---

## Prompt 4 – Integrate Mint & Fund into Invoices Flow

> Integrate **MintInvoice** and **FundInvoice** flows more seamlessly into the Invoices experience.
>
> Requirements:
> - Instead of showing `MintInvoice` and `FundInvoice` as separate big blocks on the home page, expose them as:
>   - Either top-level sections on the Invoices route, or
>   - Modal dialogs triggered by buttons like `Mint new invoice` and `Fund invoice`.
> - In `MintInvoice.tsx` and `FundInvoice.tsx`:
>   - Replace inline styles with the new UI components.
>   - Improve form layout (labels, descriptions, error messages).
>   - Add basic inline validation messages (e.g., required fields, numeric checks) without changing the backend contract.
> - Ensure success and error toasts are visually consistent with the design system.
>
> Keep all existing interactions with the backend and on-chain program intact.

---

## Prompt 5 – Upgrade Marketplace Page UI/UX

> Upgrade the **Marketplace** UI in `app/src/pages/Marketplace.tsx` for clarity and beauty.
>
> Objectives:
> - Make it obvious what a seller can do vs what a buyer can do.
> - Make allowances and remaining quantities intuitive.
>
> Requirements:
> - Use cards or rows with clear typography for each listing:
>   - Invoice id (shortened), seller (shortened), price, remaining quantity, status.
>   - Show status and on-chain / off-chain status with badges.
> - Improve the filter bar at the top:
>   - `My listings only` toggle.
>   - Invoice id filter.
>   - `Refresh` button.
> - For actions on each listing:
>   - Group seller actions (init V2, approve/revoke shares, cancel V2/V1) visually.
>   - Group buyer actions (set quantity, approve/revoke USDC, fill V2 / V1) visually.
>   - Show computed total (qty × price) near the quantity input.
>   - Show allowance information in a subtle, readable way (e.g., small text with badge).
>
> Do not alter which endpoints are called or the core logic; focus on layout, component usage, and visual hierarchy.

---

## Prompt 6 – Polish Portfolio Page

> Modernize the **Portfolio** UI in `app/src/pages/Portfolio.tsx`.
>
> Requirements:
> - When no wallet is connected, show a friendly empty state card explaining that the user must connect a wallet to see positions.
> - When a wallet is connected and there are holdings:
>   - Use a grid or table of cards showing:
>     - Invoice id (shortened), link to in-app invoice detail, explorer link.
>     - Number of shares held (formatted nicely).
>   - Include a `Refresh` button styled with the new design system.
> - Ensure typography and spacing are consistent with Invoices and Marketplace.

---

## Prompt 7 – Admin Console UX Improvements

> Upgrade the **Admin** console in `app/src/pages/Admin.tsx` so it looks like a proper admin panel.
>
> Requirements:
> - Only show admin content when `isAdmin` is true, but make the non-admin message look like a clear informational card.
> - For admin mode:
>   - Split KYC, Documents, and Credit Score into clearly labeled cards or tabs.
>   - Replace `alert()` calls with toasts using `useToast`.
>   - Use form components with labels, helper text, and error areas.
>   - For JSON payload input, use a monospace textarea with subtle background and a hint like “paste provider payload JSON”.
> - Add small helper copy explaining that this is a **sandbox / stub** admin panel, not production.
>
> Keep existing endpoints and payload shapes unchanged.

---

## Prompt 8 – Toasts, Errors & Loading States

> Align toasts, error messages, and loading states across the app with the new design system.
>
> Requirements:
> - Enhance `ToastProvider` rendering to match the overall visual language (rounded corners, shadows, color coding for info/success/error, maybe icons).
> - Replace plain red error `<div>`s with a consistent error component or styled text.
> - Ensure loading states (`Loading...` text) are visually consistent; optionally introduce simple skeleton or spinner components where appropriate.
>
> Do not change the behavior of the toast API, only its visual implementation.

---

## Prompt 9 – Responsiveness & Finishing Touches

> Make sure the upgraded UI is responsive and polished.
>
> Requirements:
> - Verify that main pages (Invoices, Marketplace, Portfolio, Admin) look good on:
>   - 1280px width (laptop)
>   - ~1024px width (small laptop/tablet landscape)
> - Avoid horizontal scroll; tables may switch to stacked layouts on smaller screens.
> - Ensure interactive elements have adequate hit areas and spacing.
> - Optionally introduce subtle hover states on rows, cards, and buttons.
>
> Finally, perform a pass to:
> - Remove obviously dead styles and unused inline styles.
> - Keep business logic untouched.
> - Summarize the visual changes and how they map to the original flows.

---

## Prompt 10 – QA: Behavior Parity Check

> Perform a behavior parity check between the original and upgraded UI.
>
> Requirements:
> - List all core flows and verify they still work from the UI perspective:
>   - Mint invoice (backend + wallet modes).
>   - Fund invoice (backend + wallet modes).
>   - Settle invoice via webhook and via wallet.
>   - List invoices, view detail, view positions and history.
>   - Create listings, deposit/approve, fulfill, cancel (V1 & V2) via UI.
>   - View/update KYC, documents, credit scores via Admin.
>   - View portfolio holdings.
> - For any issues found, propose focused fixes without regressing the new design.
>
> Return a short checklist documenting which flows were validated and any follow-up tasks.
