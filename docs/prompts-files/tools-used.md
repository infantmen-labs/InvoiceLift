# Tools Used

This project makes deliberate use of AI tooling. This document captures the main tools and how they are expected to be used, so prompts in this folder can reference them consistently.

## GPT-5.1 (High Reasoning) via Windsurf Cascade

- **Role**: Primary AI coding and design assistant, accessed as the Windsurf "Cascade" agent inside the IDE.
- **Used for**:
  - Pair-programming on backend (Express, SQLite), frontend (React/TypeScript), and Solana Anchor program code.
  - Refactoring, debugging, and performance tuning.
  - Writing and iterating on documentation, test plans, and design notes in this `docs/prompts-files` folder.
- **Expectations**:
  - Prefer small, incremental changes over large rewrites.
  - Keep responses concise and implementation-focused.
  - Treat on-chain program state as canonical, with the backend as an indexer/cache layer.

## v0 (UI Prototyping)

- **Role**: Rapid UI/UX prototyping tool.
- **Used for**:
  - Generating initial React + Tailwind component layouts and page sections.
  - Exploring alternative UI treatments (cards, tables, empty states, onboarding flows) before hand-tuning in the main app codebase.
- **Expectations**:
  - Output is treated as a starting point only; business logic, state management, and final styling are adjusted in the main repo.
  - Keep components accessible, mobile-friendly, and aligned with the existing dark theme and brand tone.