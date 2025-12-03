# InvoiceLift Landing Page Design Plan

## Overview
The goal is to create a compelling Landing Page that serves as the entry point for new users. This page will introduce the InvoiceLift platform, explain its value proposition (Invoice Financing on Solana), and guide users to the core application.

## User Flow
1.  **Visitor** lands on `https://invoicelift.app/` (Root path `/`).
2.  **Landing Page** displays:
    *   **Hero Section**: High-level pitch ("Liquidity for Real World Assets"), Call to Action ("Launch App").
    *   **Features**: Explanation of Minting, Funding, and Trading.
    *   **Stats/Trust**: (Optional) Total Value Locked, Invoices Funded.
3.  **Action**:
    *   User clicks "Launch App" -> Navigates to `/invoices` (The Dashboard).
    *   User clicks "Connect Wallet" -> Connects wallet (if supported on landing) or goes to App.

## Architecture Changes

### 1. Routing (`src/App.tsx`)
Current structure wraps all routes in `MainLayout`. We will refactor this to support different layouts for the Landing Page vs. the App.

**New Structure:**
\`\`\`tsx
<Routes>
  {/* Public / Landing */}
  <Route path="/" element={<Landing />} />

  {/* App Routes (Wrapped in MainLayout) */}
  <Route element={<MainLayout><Outlet /></MainLayout>}>
    <Route path="/invoices" element={<Invoices />} />
    <Route path="/marketplace" element={<Marketplace />} />
    <Route path="/portfolio" element={<Portfolio />} />
    {/* ... other app routes */}
  </Route>
</Routes>
\`\`\`

### 2. New Components
*   `src/pages/Landing.tsx`: The main landing page component.
*   `src/components/layout/LandingHeader.tsx`: A simplified header for the landing page (Logo + "Launch App" button).
*   `src/components/layout/LandingFooter.tsx`: Footer with links and copyright.

## Visual Design
**Theme**: Dark mode (Slate 950 background) with Violet (`brand`) accents.

### Sections

#### 1. Hero
*   **Background**: `bg-slate-950` with a subtle gradient or pattern.
*   **Headline**: "Unlock Liquidity from Your Invoices" (Text: `text-white`, `font-bold`, `text-5xl`).
*   **Subheadline**: "Mint, Fund, and Trade fractionalized invoices on the Solana blockchain." (Text: `text-slate-400`).
*   **CTA**: Primary Button (`bg-brand`) -> Links to `/invoices`.

#### 2. Features (Grid)
*   **Card 1: Mint**: "Tokenize your real-world invoices as NFTs."
*   **Card 2: Fund**: "Crowdfund invoices to get instant liquidity."
*   **Card 3: Trade**: "Buy and sell invoice fractions in the marketplace."
*   *Style*: `bg-slate-900`, `border-slate-800`, `hover:border-brand`.

#### 3. How It Works
*   Simple 3-step visual flow.

## Implementation Steps
1.  **Create Components**: Build `Landing.tsx`, `LandingHeader.tsx`, `LandingFooter.tsx`.
2.  **Refactor App.tsx**: Update routing to separate Landing from MainLayout.
3.  **Styling**: Apply Tailwind classes matching `tailwind.config.cjs` (Brand colors).
4.  **Verify**: Ensure navigation between Landing and App works smoothly.
