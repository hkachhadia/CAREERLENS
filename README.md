# CareerLens

CareerLens starter project using:

- Frontend: React (Vite)
- Backend: Node.js + Express

## Project structure

- `frontend/` React app with landing, login, and dashboard pages
- `backend/` Express API with OAuth auth routes and secure sessions

## Run locally

From the project root:

1. Install dependencies:
   - `npm install`
   - `npm --prefix frontend install`
   - `npm --prefix backend install`
2. Start apps in separate terminals:
   - Frontend: `npm run dev:frontend`
   - Backend: `npm run dev:backend`

Frontend default URL: `http://localhost:5173`  
Backend health check: `http://localhost:5000/api/health`

## OAuth authentication setup

### 1) Configure environment files

- Copy `backend/.env.example` to `backend/.env` and fill:
  - `SESSION_SECRET` (long random value)
  - Google OAuth client id/secret + callback URL
  - GitHub OAuth client id/secret + callback URL
- Copy `frontend/.env.example` to `frontend/.env` if API URL changes.

### 2) Provider callback URLs

- Google callback URL: `http://localhost:5000/api/auth/google/callback`
- GitHub callback URL: `http://localhost:5000/api/auth/github/callback`

### 3) Implemented auth endpoints

- `GET /api/auth/google` - starts Google OAuth
- `GET /api/auth/google/callback` - Google callback
- `GET /api/auth/github` - starts GitHub OAuth
- `GET /api/auth/github/callback` - GitHub callback
- `GET /api/auth/me` - returns authenticated user from session
- `POST /api/auth/logout` - logs out and destroys session

### Session security defaults

- `httpOnly` session cookie (`careerlens.sid`)
- `sameSite: "lax"` to reduce CSRF risk on top-level cross-site nav
- `secure` cookie enabled automatically in production
- Session regenerated after OAuth callback to mitigate session fixation

## API integrations (GitHub + competitive profiles)

### GitHub endpoints

- `GET /api/integrations/github/:username`
  - Returns profile metadata, recently updated repositories, and recent commits by that user.
  - Optional env var: `GITHUB_API_TOKEN` for better rate limits.

### Competitive platform endpoints

- `GET /api/integrations/competitive/:platform/:username`
  - Supported platforms: `codeforces`, `leetcode`, `hackerrank`
- `GET /api/integrations/competitive/aggregate?codeforces=<u>&leetcode=<u>&hackerrank=<u>`
  - Returns combined results for the provided handles.

### Notes

- Codeforces uses its official public API.
- LeetCode uses public GraphQL endpoint data.
- HackerRank has limited public API support; this project uses lightweight profile scraping fallback.

## Analytics engine (Gemini)

- Endpoint: `POST /api/analytics/skills-score`
- Purpose: analyze skill/profile data and generate normalized scores plus recommendations.
- AI provider: Gemini via `@google/generative-ai` (free tier possible with API key).

### Request body example

```json
{
  "name": "Vaide",
  "role": "Full Stack Developer",
  "skills": ["React", "Node.js", "SQL", "Docker"],
  "projects": ["CareerLens", "Portfolio Website"],
  "summary": "Built end-to-end apps and collaborated in team projects.",
  "github": { "username": "octocat" },
  "codingProfiles": { "leetcode": "sample_user", "codeforces": "tourist" }
}
```

### Response shape

- `analysis.overallScore` (0-100)
- `analysis.categoryScores.technical`
- `analysis.categoryScores.problemSolving`
- `analysis.categoryScores.communication`
- `analysis.strengths`, `analysis.gaps`, `analysis.recommendations`
- `analysis.source` indicates `gemini` or `fallback-heuristic`
- `benchmarkComparison` includes skill-gap scoring against target role/company benchmark

### Env vars

- `GEMINI_API_KEY` required for Gemini analysis
- `GEMINI_MODEL` optional (default: `gemini-1.5-flash`)

If Gemini is unavailable, the endpoint automatically returns a heuristic fallback analysis.

## Scoring model (role/company benchmark)

CareerLens now includes a deterministic benchmark scoring model to compare user skills with role or company expectations.

### Benchmark endpoint

- `POST /api/analytics/benchmark-score`

Request body:

```json
{
  "targetRole": "Full Stack Developer",
  "skills": [
    { "name": "React", "level": "advanced" },
    { "name": "Node.js", "score": 78 },
    "SQL"
  ],
  "companyBenchmark": [
    { "skill": "react", "weight": 0.25, "targetLevel": "advanced" },
    { "skill": "system design", "weight": 0.2, "targetLevel": "intermediate" }
  ]
}
```

Behavior:

- Uses weighted skill matching (`weight` normalized automatically)
- Converts levels (`beginner`/`intermediate`/`advanced`/`expert`) to numeric targets
- Computes:
  - `overallBenchmarkScore` (0-100 weighted readiness)
  - `coverageScore` (how much of benchmark skill areas are represented)
  - `matchedSkills` and `missingSkills`
  - `suggestions` based on top skill gaps
- If `companyBenchmark` is omitted, uses built-in default benchmarks for common roles.

## Analysis history database schema

Recommended database: PostgreSQL (reliable JSONB support + indexing).

Schema file:

- `backend/db/schema.sql`

Tables:

- `users`
  - Maps OAuth identities (`auth_provider`, `provider_user_id`) to internal user records.
- `analysis_history`
  - Stores each generated analysis with:
    - normalized scores
    - strengths/gaps/recommendations
    - full input payload (JSONB)
    - `analysis_source` (`gemini` / `fallback-heuristic`)
    - timestamps (`analyzed_at`, `created_at`)
- `analysis_integrations`
  - Stores platform snapshots (GitHub / LeetCode / Codeforces / HackerRank) tied to each analysis run.

Indexes included:

- Fast history timeline retrieval by user and date
- GIN index for querying JSONB `input_payload`
- Integration lookup by `analysis_id`

Initialize DB:

1. Create DB and set `DATABASE_URL` in `backend/.env`
2. Run:
   - `psql "$DATABASE_URL" -f backend/db/schema.sql`

## Free deployment (no-cost setup)

This repo is configured for:

- Frontend: Vercel free tier (`frontend/vercel.json`)
- Backend: Render free tier (`render.yaml`)

### 1) Deploy backend on Render (free)

1. Connect this GitHub repo in Render.
2. Create a new Blueprint/Web Service using `render.yaml`.
3. Ensure plan is **Free**.
4. Add environment variables from `backend/.env.example`:
   - required for runtime: `FRONTEND_URL`, `SESSION_SECRET`
   - optional until you enable related features: OAuth keys, `GEMINI_API_KEY`, `GITHUB_API_TOKEN`, `DATABASE_URL`
5. Deploy and confirm health check:
   - `https://<your-render-backend>/api/health`

### 2) Deploy frontend on Vercel (free)

1. Import repo into Vercel.
2. Set root directory to `frontend`.
3. Framework preset: Vite.
4. Add env var:
   - `VITE_API_BASE_URL=https://<your-render-backend>`
5. Deploy.

### 3) OAuth callback update after deploy

Update OAuth providers with production callback URLs:

- Google: `https://<your-render-backend>/api/auth/google/callback`
- GitHub: `https://<your-render-backend>/api/auth/github/callback`

Set `FRONTEND_URL` in backend env to your Vercel domain.

### Free-tier cost guardrails

- Keep Render plan as `free`.
- Keep Vercel on Hobby/free.
- Do not enable paid DB/logging add-ons unless needed.
- Keep low-frequency polling (dashboard is set to 20s refresh).

## Test checklist

### Automated tests run locally

- Frontend production build: `npm --prefix frontend run build`
- Backend smoke suite: `npm --prefix backend run test:smoke`
  - checks `/api/health`
  - checks `/api/analytics/benchmark-score`
  - checks `/api/analytics/skills-score`

### Manual verification after deployment

1. Open frontend and verify dashboard loads.
2. Confirm analytics refresh updates score cards and trend chart.
3. Run GitHub integration endpoint for a sample user.
4. Test competitive endpoint for one platform (Codeforces preferred).
5. Test OAuth login/logout flow once provider keys are configured.
