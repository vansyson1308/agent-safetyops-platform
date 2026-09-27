# Contributing to Agent SafetyOps Platform

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/vansyson1308/agent-safetyops-platform.git
cd agent-safetyops-platform

# Install dependencies
npm install
cp .env.example .env

# Set up database
npx prisma generate
npx prisma db push
npm run seed

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

## Project Structure

```
src/
  routes/          # Express API route handlers
  services/        # Business logic (policy engine, runs, browser sessions, Gemini AI, audit)
  middleware/      # Auth middleware
  pages/           # React page components
  components/      # Reusable React components
  types/           # Shared TypeScript interfaces
  lib/             # Shared helpers (API client, Prisma client, permissions)
prisma/            # Database schema and seeds
tests/             # Vitest unit and API tests (run against a throwaway SQLite database)
```

## Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Run lint: `npm run lint`
4. Run tests: `npm test`
5. Commit with a descriptive message
6. Push and open a Pull Request

## Code Style

- Zod validation on all API inputs
- Audit events for all mutations
- Reuse shared components (`RiskScoreBar`, `StatusBadge`)

## Reporting Issues

Please use GitHub Issues with a clear description and reproduction steps.
