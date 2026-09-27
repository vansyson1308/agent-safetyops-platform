<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node" />
  <img src="https://img.shields.io/badge/typescript-5.8-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome" />
</p>

# Agent SafetyOps Platform

**Open-source AI Agent Safety, Governance & Observability Platform**

SafetyOps provides enterprise-grade safety controls for AI agent deployments. It monitors agent actions in real-time, enforces security policies, manages human-in-the-loop approval workflows, and provides a complete audit trail for compliance.

## Why SafetyOps?

As AI agents become more autonomous, organizations need guardrails:

- **Policy Enforcement** - Define rules for what agents can and cannot do (blocked tools, domain restrictions, spend limits)
- **Approval Workflows** - High-risk actions are automatically flagged and require human approval before proceeding
- **Risk Scoring** - AI-powered risk assessment (Google Gemini) analyzes every action for potential security threats
- **Browser Sandboxing** - Monitor and control agent browser automation with per-action risk classification
- **Complete Audit Trail** - Every action, decision, and approval is logged for regulatory compliance
- **SDK Integration** - TypeScript SDK lets any AI agent framework integrate with SafetyOps in minutes

## Quick Start

```bash
# Clone and install
git clone https://github.com/vansyson1308/agent-safetyops-platform.git
cd agent-safetyops-platform
npm install
cp .env.example .env

# Set up database
npx prisma generate
npx prisma db push
npm run seed

# Start development server
npm run dev
```

Open `http://localhost:3000` and sign in with a seeded demo account:

| Email | Password | Role |
|-------|----------|------|
| `admin@safetyops.ai` | `admin123` | admin |
| `analyst@safetyops.ai` | `analyst123` | analyst |

The seed data is for local demos only. On a fresh database without the seed, the first account you register becomes the instance owner.

## Access Control

Every API route except `/api/health`, `/api/auth/*` and the SDK endpoints requires a signed-in user (`Authorization: Bearer <jwt>`). Roles grant:

| Role | Read everything | Runs, incidents, browser sessions | Approve / deny | Agents, policies, API keys |
|------|:---:|:---:|:---:|:---:|
| owner, admin | ✓ | ✓ | ✓ | ✓ |
| analyst | ✓ | ✓ | | |
| approver | ✓ | | ✓ | |
| viewer | ✓ | | | |

Open sign-up is disabled by default. Set `ALLOW_REGISTRATION=true` to let anyone create a `viewer` account.

## Architecture

```
Frontend (React 19 + Vite)          Backend (Express.js)
  Dashboard                           /api/agents      - Agent CRUD
  Agents Management                   /api/policies    - Policy CRUD
  Security Policies                   /api/runs        - Execution monitoring
  Execution Runs                      /api/approvals   - Approval workflow
  Browser Sandbox                     /api/incidents   - Incident management
  Approval Gates                      /api/audit-events - Audit trail
  Incident Reports                    /api/v1/sdk/*    - SDK API endpoints
  Audit Log                           /api/auth        - JWT authentication
  Settings
```

**Tech Stack:**
- **Frontend**: React 19, React Router v7, Tailwind CSS v4, React Query, Recharts, Shadcn/UI
- **Backend**: Express.js, Prisma ORM (SQLite/PostgreSQL), Zod validation
- **AI**: Google Gemini API for risk scoring and policy explanations
- **Auth**: JWT + API Key authentication
- **Language**: TypeScript throughout

## SDK Integration

SafetyOps provides a REST API that any AI agent framework can integrate with. An admin creates an API key for an agent under **Settings → SDK API Keys**; the key is shown once and can only act for that agent.

```typescript
// 1. Start a run (for the key's agent)
const run = await fetch('/api/v1/sdk/runs', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer sk-your-api-key', 'Content-Type': 'application/json' },
  body: JSON.stringify({ task: 'Process refund for order #12345' })
});

// 2. Report each action step
const decision = await fetch(`/api/v1/sdk/runs/${runId}/steps`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer sk-your-api-key', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    actionType: 'tool_call',
    actionName: 'issue_refund',
    actionInput: { userId: '12345', amount: 120 }
  })
});

// 3. Check if blocked (agent polls this)
const status = await fetch(`/api/v1/sdk/runs/${runId}/decision`, {
  headers: { 'Authorization': 'Bearer sk-your-api-key' }
});
// { blocked: true, pendingApprovals: 1, status: 'blocked' }

// 4. Finish (only possible while the run is running, i.e. not waiting on approval)
await fetch(`/api/v1/sdk/runs/${runId}/complete`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer sk-your-api-key', 'Content-Type': 'application/json' },
  body: JSON.stringify({ summary: 'Refund processed' })
});
```

## Key Features

### Policy Engine
Define deterministic security rules that are evaluated before every agent action:
- **Allowed / Blocked Tools** - Restrict tool calls to an allow-list, or block dangerous tools (e.g., `wire_transfer`, `delete_account`). An empty allow-list (or `*`) allows any tool
- **Domain Restrictions** - Hostnames are extracted from the step input (URLs, bare domains, email addresses; percent-encoding is decoded) and matched per domain: blocking `x.com` covers `api.x.com` but not `dropbox.com`. Allowed domains are checked against URL hosts
- **Restricted Actions** - Pause the run for human approval
- **Step Limits** - Cap the number of steps per run
- **Custom Rules** - Match on `actionType`, `actionName` or `actionNamePattern` (regex) and `block` or `require_approval`

Policies apply globally or to one agent. The engine fails closed: a policy or rule it cannot parse blocks the step until it is fixed.

### Approval Workflow
When a policy violation is detected:
1. The agent's run is automatically paused/blocked
2. An approval request is created with full context
3. A human reviewer (approver, admin or owner) can approve or deny the action
4. The run resumes once every pending request is approved, or fails if one is denied

A paused or blocked run cannot be resumed or completed any other way; it can only be cancelled (marked failed).

### Browser Sandboxing
Monitor AI agents performing browser automation:
- Per-action risk assessment using Gemini AI
- Credential entry detection and blocking
- Session replay with action timeline
- Artifact capture (screenshots, extracted text)

## Deployment

### Docker
```bash
docker build -t safetyops .
docker run -p 3000:3000 -v safetyops-data:/app/data \
  -e JWT_SECRET=$(openssl rand -hex 32) -e GEMINI_API_KEY=your_key safetyops
```
The container creates its SQLite database in `/app/data` on start, so mount a volume there to keep data.

### Docker Compose
```bash
export JWT_SECRET=$(openssl rand -hex 32)
docker compose up
```

### Google Cloud Run
```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT/safetyops
gcloud run deploy safetyops --image gcr.io/YOUR_PROJECT/safetyops --set-env-vars="GEMINI_API_KEY=your_key,JWT_SECRET=your_secret"
```

### PostgreSQL (Production)
Change the datasource `provider` in `prisma/schema.prisma` to `"postgresql"` and point `DATABASE_URL` at your database.
Then run `npx prisma migrate dev --name init`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Database URL. SQLite paths are relative to `prisma/` (e.g. `file:./dev.db`) |
| `GEMINI_API_KEY` | No | Google Gemini API key for AI risk scoring |
| `JWT_SECRET` | In production | Secret for signing JWTs. The server refuses to start without it when `NODE_ENV=production`; in development a random one is generated per start |
| `ALLOW_REGISTRATION` | No | `true` lets anyone register a `viewer` account (default: only the first account can register) |
| `CORS_ORIGINS` | No | Comma-separated origins allowed to call the API cross-origin (default: same-origin only) |
| `PORT` | No | Server port (default: 3000) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST/PUT/DELETE | `/api/agents` | Agent CRUD |
| GET/POST/PUT/DELETE | `/api/policies` | Policy CRUD |
| GET/POST | `/api/runs` | Execution runs |
| POST | `/api/runs/:id/steps` | Record a step (evaluated against policies) |
| PATCH | `/api/runs/:id` | Complete (`completed`) or cancel (`failed`) a run, or edit its summary |
| POST | `/api/runs/:id/analyze` | AI risk analysis |
| GET/PATCH | `/api/approvals` | Approval workflow |
| GET/POST/PATCH | `/api/incidents` | Incident management |
| GET/POST | `/api/browser-sessions` | Browser sandbox |
| GET | `/api/audit-events` | Audit trail |
| POST | `/api/auth/login` | JWT login |
| POST | `/api/auth/register` | User registration (first user, or when `ALLOW_REGISTRATION=true`) |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/status` | Whether first-time setup or registration is available |
| POST | `/api/v1/sdk/runs` | SDK: Start run |
| POST | `/api/v1/sdk/runs/:id/steps` | SDK: Report step |
| GET | `/api/v1/sdk/runs/:id/decision` | SDK: Check decision |
| POST | `/api/v1/sdk/runs/:id/complete` | SDK: Complete run |
| GET/POST/DELETE | `/api/api-keys` | Manage SDK API keys (admin) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT - see [LICENSE](LICENSE) for details.
