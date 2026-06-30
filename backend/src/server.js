import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import passport from "passport";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production";
const githubToken = process.env.GITHUB_API_TOKEN || "";
const geminiApiKey = process.env.GEMINI_API_KEY || "";
const geminiModelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const hasGoogleOAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const hasGithubOAuth = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

const requiredOauthEnvVars = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET"
];

const missingVars = requiredOauthEnvVars.filter((name) => !process.env[name]);
if (missingVars.length > 0) {
  console.warn(
    `Missing environment variables: ${missingVars.join(", ")}. OAuth routes will not work until these are set.`
  );
}

app.use(
  cors({
    origin: frontendUrl,
    credentials: true
  })
);
app.use(express.json());
app.set("trust proxy", 1);
app.use(
  session({
    name: "careerlens.sid",
    secret: process.env.SESSION_SECRET || "replace-me-in-env",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

if (hasGoogleOAuth) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL ||
          "http://localhost:5000/api/auth/google/callback"
      },
      (_accessToken, _refreshToken, profile, done) => {
        const normalizedUser = {
          id: profile.id,
          provider: "google",
          displayName: profile.displayName,
          email: profile.emails?.[0]?.value || null,
          avatar: profile.photos?.[0]?.value || null
        };
        done(null, normalizedUser);
      }
    )
  );
}

if (hasGithubOAuth) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL:
          process.env.GITHUB_CALLBACK_URL ||
          "http://localhost:5000/api/auth/github/callback"
      },
      (_accessToken, _refreshToken, profile, done) => {
        const normalizedUser = {
          id: profile.id,
          provider: "github",
          displayName: profile.displayName || profile.username,
          email: profile.emails?.[0]?.value || null,
          avatar: profile.photos?.[0]?.value || null
        };
        done(null, normalizedUser);
      }
    )
  );
}

app.use(passport.initialize());
app.use(passport.session());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "CareerLens API" });
});

const toScore = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const SKILL_LEVEL_TO_SCORE = {
  beginner: 40,
  intermediate: 65,
  advanced: 85,
  expert: 100
};

const DEFAULT_ROLE_BENCHMARKS = {
  "frontend developer": [
    { skill: "react", weight: 0.24, targetLevel: "advanced" },
    { skill: "javascript", weight: 0.2, targetLevel: "advanced" },
    { skill: "html", weight: 0.1, targetLevel: "advanced" },
    { skill: "css", weight: 0.1, targetLevel: "advanced" },
    { skill: "typescript", weight: 0.12, targetLevel: "intermediate" },
    { skill: "testing", weight: 0.12, targetLevel: "intermediate" },
    { skill: "git", weight: 0.12, targetLevel: "intermediate" }
  ],
  "backend developer": [
    { skill: "node.js", weight: 0.22, targetLevel: "advanced" },
    { skill: "sql", weight: 0.18, targetLevel: "advanced" },
    { skill: "api design", weight: 0.18, targetLevel: "advanced" },
    { skill: "system design", weight: 0.14, targetLevel: "intermediate" },
    { skill: "security", weight: 0.14, targetLevel: "intermediate" },
    { skill: "testing", weight: 0.14, targetLevel: "intermediate" }
  ],
  "full stack developer": [
    { skill: "react", weight: 0.15, targetLevel: "advanced" },
    { skill: "node.js", weight: 0.15, targetLevel: "advanced" },
    { skill: "javascript", weight: 0.12, targetLevel: "advanced" },
    { skill: "sql", weight: 0.1, targetLevel: "intermediate" },
    { skill: "api design", weight: 0.12, targetLevel: "advanced" },
    { skill: "system design", weight: 0.1, targetLevel: "intermediate" },
    { skill: "testing", weight: 0.1, targetLevel: "intermediate" },
    { skill: "git", weight: 0.08, targetLevel: "intermediate" },
    { skill: "docker", weight: 0.08, targetLevel: "intermediate" }
  ]
};

const normalizeSkillValue = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^\w\s.+#-]/g, "")
    .trim();

const normalizeBenchmark = (benchmark = []) => {
  const normalized = benchmark
    .filter((item) => item && item.skill)
    .map((item) => ({
      skill: normalizeSkillValue(item.skill),
      weight: Number(item.weight) > 0 ? Number(item.weight) : 0,
      targetLevel: SKILL_LEVEL_TO_SCORE[item.targetLevel] ? item.targetLevel : "intermediate"
    }));

  const totalWeight = normalized.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return [];
  }

  return normalized.map((item) => ({
    ...item,
    weight: item.weight / totalWeight
  }));
};

const buildSkillScoreMap = (skills = []) => {
  const scoreMap = new Map();

  skills.forEach((entry) => {
    if (typeof entry === "string") {
      scoreMap.set(normalizeSkillValue(entry), 70);
      return;
    }

    if (entry && typeof entry === "object" && entry.name) {
      const key = normalizeSkillValue(entry.name);
      if (!key) return;
      const explicitScore = Number(entry.score);
      if (!Number.isNaN(explicitScore)) {
        scoreMap.set(key, toScore(explicitScore));
        return;
      }
      if (entry.level && SKILL_LEVEL_TO_SCORE[entry.level]) {
        scoreMap.set(key, SKILL_LEVEL_TO_SCORE[entry.level]);
        return;
      }
      scoreMap.set(key, 70);
    }
  });

  return scoreMap;
};

const compareAgainstBenchmark = ({ skills = [], targetRole = "", companyBenchmark = [] }) => {
  const roleKey = normalizeSkillValue(targetRole);
  const roleBenchmark = DEFAULT_ROLE_BENCHMARKS[roleKey] || [];
  const selectedBenchmark = companyBenchmark.length > 0 ? companyBenchmark : roleBenchmark;
  const normalizedBenchmark = normalizeBenchmark(selectedBenchmark);

  if (normalizedBenchmark.length === 0) {
    return {
      targetRole,
      benchmarkUsed: "none",
      overallBenchmarkScore: 0,
      coverageScore: 0,
      matchedSkills: [],
      missingSkills: [],
      suggestions: ["Provide a valid role or company benchmark with weighted skills."]
    };
  }

  const userSkillMap = buildSkillScoreMap(skills);
  const matchedSkills = [];
  const missingSkills = [];
  let weightedScore = 0;
  let coverageWeight = 0;

  normalizedBenchmark.forEach((required) => {
    const userSkillScore = userSkillMap.get(required.skill) || 0;
    const targetScore = SKILL_LEVEL_TO_SCORE[required.targetLevel];
    const ratio = targetScore > 0 ? Math.min(1, userSkillScore / targetScore) : 0;
    const contribution = required.weight * ratio * 100;
    weightedScore += contribution;

    if (userSkillScore > 0) {
      coverageWeight += required.weight;
      matchedSkills.push({
        skill: required.skill,
        userScore: userSkillScore,
        targetScore,
        readiness: toScore(ratio * 100),
        weight: Number(required.weight.toFixed(4))
      });
    } else {
      missingSkills.push({
        skill: required.skill,
        targetLevel: required.targetLevel,
        targetScore,
        weight: Number(required.weight.toFixed(4))
      });
    }
  });

  const coverageScore = toScore(coverageWeight * 100);
  const overallBenchmarkScore = toScore(weightedScore);
  const suggestions = missingSkills
    .slice(0, 5)
    .map((item) => `Improve ${item.skill} to at least ${item.targetLevel} level.`);

  return {
    targetRole,
    benchmarkUsed: companyBenchmark.length > 0 ? "company" : "role-default",
    overallBenchmarkScore,
    coverageScore,
    matchedSkills: matchedSkills.sort((a, b) => b.weight - a.weight),
    missingSkills: missingSkills.sort((a, b) => b.weight - a.weight),
    suggestions
  };
};

const fallbackSkillAnalysis = ({ skills = [], projects = [], summary = "" }) => {
  const normalizedSkills = skills.map((skill) => String(skill).toLowerCase());
  const codingKeywords = ["react", "node", "javascript", "python", "java", "sql", "api", "docker"];
  const communicationKeywords = ["mentor", "lead", "presentation", "collaborat", "communication"];
  const problemKeywords = ["algorithm", "optimization", "debug", "refactor", "design"];

  const keywordHits = (pool) =>
    pool.filter((token) =>
      normalizedSkills.some((skill) => skill.includes(token)) || summary.toLowerCase().includes(token)
    ).length;

  const technical = toScore(35 + normalizedSkills.length * 5 + projects.length * 4 + keywordHits(codingKeywords) * 4);
  const communication = toScore(
    30 + projects.length * 5 + keywordHits(communicationKeywords) * 8 + (summary.length > 120 ? 10 : 0)
  );
  const problemSolving = toScore(32 + projects.length * 6 + keywordHits(problemKeywords) * 7);
  const overall = toScore(technical * 0.45 + communication * 0.2 + problemSolving * 0.35);

  return {
    overallScore: overall,
    categoryScores: {
      technical,
      problemSolving,
      communication
    },
    strengths: normalizedSkills.slice(0, 5),
    gaps: [
      "Add measurable project outcomes",
      "Include advanced problem-solving examples",
      "Highlight collaborative impact"
    ],
    recommendations: [
      "Build one end-to-end project with deployment and monitoring.",
      "Practice timed coding rounds weekly and track solved problems.",
      "Document achievements using impact metrics (%, time saved, scale)."
    ],
    confidence: "medium",
    source: "fallback-heuristic"
  };
};

const extractJsonBlock = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  throw new Error("No JSON object found in model response");
};

const analyzeSkillsWithGemini = async (payload) => {
  if (!geminiApiKey) {
    return fallbackSkillAnalysis(payload);
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: geminiModelName });

  const prompt = `
You are a strict career analytics engine. Analyze the candidate profile and return ONLY valid JSON with this exact shape:
{
  "overallScore": number,
  "categoryScores": {
    "technical": number,
    "problemSolving": number,
    "communication": number
  },
  "strengths": string[],
  "gaps": string[],
  "recommendations": string[],
  "confidence": "low" | "medium" | "high",
  "source": "gemini"
}

Rules:
- Score range for all scores: 0-100
- Keep strengths/gaps/recommendations concise (max 5 each)
- Base analysis only on provided data, do not hallucinate missing achievements.

Candidate payload:
${JSON.stringify(payload, null, 2)}
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = JSON.parse(extractJsonBlock(text));

  return {
    overallScore: toScore(parsed.overallScore),
    categoryScores: {
      technical: toScore(parsed?.categoryScores?.technical),
      problemSolving: toScore(parsed?.categoryScores?.problemSolving),
      communication: toScore(parsed?.categoryScores?.communication)
    },
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [],
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 5) : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 5) : [],
    confidence: ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "medium",
    source: "gemini"
  };
};

const buildGithubHeaders = () => {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CareerLens-App"
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  return headers;
};

const fetchGithubUser = async (username) => {
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: buildGithubHeaders()
  });
  if (!response.ok) {
    throw new Error(`GitHub user fetch failed (${response.status})`);
  }
  return response.json();
};

const fetchGithubRepos = async (username, limit = 6) => {
  const response = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=${limit}`,
    { headers: buildGithubHeaders() }
  );
  if (!response.ok) {
    throw new Error(`GitHub repos fetch failed (${response.status})`);
  }
  return response.json();
};

const fetchRecentCommitsForRepos = async (username, repos) => {
  const commitRequests = repos.slice(0, 5).map(async (repo) => {
    const commitsResponse = await fetch(
      `https://api.github.com/repos/${repo.owner.login}/${repo.name}/commits?author=${encodeURIComponent(username)}&per_page=5`,
      { headers: buildGithubHeaders() }
    );
    if (!commitsResponse.ok) {
      return [];
    }
    const commits = await commitsResponse.json();
    return commits.map((commit) => ({
      repo: repo.name,
      sha: commit.sha,
      message: commit.commit?.message?.split("\n")[0] || "No message",
      date: commit.commit?.author?.date || null,
      url: commit.html_url
    }));
  });

  const nestedCommits = await Promise.all(commitRequests);
  return nestedCommits
    .flat()
    .filter((commit) => commit.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 12);
};

const fetchCodeforcesProfile = async (username) => {
  const userInfoResponse = await fetch(
    `https://codeforces.com/api/user.info?handles=${encodeURIComponent(username)}`
  );
  const userStatusResponse = await fetch(
    `https://codeforces.com/api/user.status?handle=${encodeURIComponent(username)}&from=1&count=10`
  );

  if (!userInfoResponse.ok || !userStatusResponse.ok) {
    throw new Error("Codeforces API unavailable");
  }

  const userInfoPayload = await userInfoResponse.json();
  const userStatusPayload = await userStatusResponse.json();
  const user = userInfoPayload.result?.[0];
  const recentSubmissions = (userStatusPayload.result || []).map((submission) => ({
    id: submission.id,
    problem: submission.problem?.name || "Unknown problem",
    verdict: submission.verdict || "UNKNOWN",
    language: submission.programmingLanguage || "Unknown",
    timestamp: submission.creationTimeSeconds
      ? new Date(submission.creationTimeSeconds * 1000).toISOString()
      : null
  }));

  return {
    platform: "codeforces",
    username,
    rating: user?.rating ?? null,
    maxRating: user?.maxRating ?? null,
    rank: user?.rank ?? null,
    maxRank: user?.maxRank ?? null,
    contribution: user?.contribution ?? null,
    recentSubmissions
  };
};

const fetchLeetCodeProfile = async (username) => {
  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      operationName: "getUserProfile",
      query: `
        query getUserProfile($username: String!) {
          matchedUser(username: $username) {
            username
            profile {
              ranking
              reputation
              starRating
            }
            submitStats {
              acSubmissionNum {
                difficulty
                count
              }
            }
          }
        }
      `,
      variables: { username }
    })
  });

  if (!response.ok) {
    throw new Error(`LeetCode API unavailable (${response.status})`);
  }

  const payload = await response.json();
  const matchedUser = payload?.data?.matchedUser;
  if (!matchedUser) {
    throw new Error("LeetCode user not found");
  }

  const solved = matchedUser.submitStats?.acSubmissionNum || [];
  return {
    platform: "leetcode",
    username: matchedUser.username,
    ranking: matchedUser.profile?.ranking ?? null,
    reputation: matchedUser.profile?.reputation ?? null,
    starRating: matchedUser.profile?.starRating ?? null,
    solvedByDifficulty: solved
  };
};

const scrapeHackerRankProfile = async (username) => {
  const profileUrl = `https://www.hackerrank.com/profile/${encodeURIComponent(username)}`;
  const response = await fetch(profileUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 CareerLens"
    }
  });
  if (!response.ok) {
    throw new Error(`HackerRank profile fetch failed (${response.status})`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const title = $("title").text().trim();
  const badgeCount = $(".hacker-badge, .badge-card").length || null;
  const textSnapshot = $("body").text().replace(/\s+/g, " ").trim().slice(0, 250);

  return {
    platform: "hackerrank",
    username,
    profileUrl,
    pageTitle: title || null,
    badgesDetected: badgeCount,
    scrapeNote:
      "HackerRank has limited public APIs, so this endpoint returns lightweight scraped profile signals.",
    snapshot: textSnapshot || null
  };
};

app.get("/api/integrations/github/:username", async (req, res, next) => {
  try {
    const { username } = req.params;
    const user = await fetchGithubUser(username);
    const repos = await fetchGithubRepos(username);
    const recentCommits = await fetchRecentCommitsForRepos(username, repos);

    const normalizedRepos = repos.map((repo) => ({
      name: repo.name,
      description: repo.description,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      updatedAt: repo.updated_at,
      url: repo.html_url
    }));

    res.json({
      platform: "github",
      user: {
        username: user.login,
        name: user.name,
        avatar: user.avatar_url,
        followers: user.followers,
        following: user.following,
        publicRepos: user.public_repos,
        profileUrl: user.html_url
      },
      repos: normalizedRepos,
      recentCommits
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/integrations/competitive/:platform/:username", async (req, res) => {
  const { platform, username } = req.params;
  try {
    if (platform === "codeforces") {
      const data = await fetchCodeforcesProfile(username);
      return res.json(data);
    }
    if (platform === "leetcode") {
      const data = await fetchLeetCodeProfile(username);
      return res.json(data);
    }
    if (platform === "hackerrank") {
      const data = await scrapeHackerRankProfile(username);
      return res.json(data);
    }

    return res.status(400).json({
      message: "Unsupported platform. Use codeforces, leetcode, or hackerrank."
    });
  } catch (error) {
    return res.status(502).json({
      platform,
      username,
      message: error.message
    });
  }
});

app.get("/api/integrations/competitive/aggregate", async (req, res) => {
  const { codeforces, leetcode, hackerrank } = req.query;
  const tasks = [];

  if (codeforces) {
    tasks.push(
      fetchCodeforcesProfile(codeforces)
        .then((data) => ({ key: "codeforces", success: true, data }))
        .catch((error) => ({ key: "codeforces", success: false, error: error.message }))
    );
  }
  if (leetcode) {
    tasks.push(
      fetchLeetCodeProfile(leetcode)
        .then((data) => ({ key: "leetcode", success: true, data }))
        .catch((error) => ({ key: "leetcode", success: false, error: error.message }))
    );
  }
  if (hackerrank) {
    tasks.push(
      scrapeHackerRankProfile(hackerrank)
        .then((data) => ({ key: "hackerrank", success: true, data }))
        .catch((error) => ({ key: "hackerrank", success: false, error: error.message }))
    );
  }

  if (tasks.length === 0) {
    return res.status(400).json({
      message: "Provide at least one username query param: codeforces, leetcode, hackerrank."
    });
  }

  const results = await Promise.all(tasks);
  const payload = results.reduce((acc, result) => {
    acc[result.key] = result.success ? result.data : { error: result.error };
    return acc;
  }, {});

  return res.json(payload);
});

app.post("/api/analytics/skills-score", async (req, res) => {
  const {
    name = "Candidate",
    role = "",
    skills = [],
    projects = [],
    summary = "",
    github = null,
    codingProfiles = {},
    companyBenchmark = []
  } = req.body || {};

  if (!Array.isArray(skills) || !Array.isArray(projects)) {
    return res.status(400).json({
      message: "`skills` and `projects` must be arrays."
    });
  }

  try {
    const benchmarkComparison = compareAgainstBenchmark({
      skills,
      targetRole: role,
      companyBenchmark: Array.isArray(companyBenchmark) ? companyBenchmark : []
    });

    const analysis = await analyzeSkillsWithGemini({
      name,
      role,
      skills,
      projects,
      summary,
      github,
      codingProfiles,
      benchmarkComparison
    });

    return res.json({
      candidate: { name, role },
      analysis,
      benchmarkComparison
    });
  } catch (error) {
    const fallback = fallbackSkillAnalysis({ skills, projects, summary });
    const benchmarkComparison = compareAgainstBenchmark({
      skills,
      targetRole: role,
      companyBenchmark: Array.isArray(companyBenchmark) ? companyBenchmark : []
    });
    return res.status(200).json({
      candidate: { name, role },
      analysis: fallback,
      benchmarkComparison,
      note: `Gemini call failed, returned fallback analysis. Reason: ${error.message}`
    });
  }
});

app.post("/api/analytics/benchmark-score", (req, res) => {
  const { skills = [], targetRole = "", companyBenchmark = [] } = req.body || {};

  if (!Array.isArray(skills)) {
    return res.status(400).json({ message: "`skills` must be an array." });
  }

  if (!Array.isArray(companyBenchmark)) {
    return res.status(400).json({ message: "`companyBenchmark` must be an array when provided." });
  }

  const result = compareAgainstBenchmark({ skills, targetRole, companyBenchmark });
  return res.json(result);
});

app.get("/api/auth/google", (req, res, next) => {
  if (!hasGoogleOAuth) {
    return res.status(503).json({ message: "Google OAuth is not configured." });
  }
  return passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

app.get("/api/auth/google/callback", (req, res, next) => {
  if (!hasGoogleOAuth) {
    return res.redirect(`${frontendUrl}/login?error=google_oauth_not_configured`);
  }
  passport.authenticate("google", (authError, user) => {
    if (authError || !user) {
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
    return req.session.regenerate((sessionError) => {
      if (sessionError) {
        return res.redirect(`${frontendUrl}/login?error=session_regenerate_failed`);
      }
      return req.logIn(user, (loginError) => {
        if (loginError) {
          return next(loginError);
        }
        return res.redirect(`${frontendUrl}/dashboard`);
      });
    });
  })(req, res, next);
});

app.get("/api/auth/github", (req, res, next) => {
  if (!hasGithubOAuth) {
    return res.status(503).json({ message: "GitHub OAuth is not configured." });
  }
  return passport.authenticate("github", { scope: ["user:email"] })(req, res, next);
});

app.get("/api/auth/github/callback", (req, res, next) => {
  if (!hasGithubOAuth) {
    return res.redirect(`${frontendUrl}/login?error=github_oauth_not_configured`);
  }
  passport.authenticate("github", (authError, user) => {
    if (authError || !user) {
      return res.redirect(`${frontendUrl}/login?error=github_auth_failed`);
    }
    return req.session.regenerate((sessionError) => {
      if (sessionError) {
        return res.redirect(`${frontendUrl}/login?error=session_regenerate_failed`);
      }
      return req.logIn(user, (loginError) => {
        if (loginError) {
          return next(loginError);
        }
        return res.redirect(`${frontendUrl}/dashboard`);
      });
    });
  })(req, res, next);
});

app.get("/api/auth/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({ authenticated: true, user: req.user });
});

app.post("/api/auth/logout", (req, res, next) => {
  req.logout((logoutError) => {
    if (logoutError) {
      return next(logoutError);
    }
    return req.session.destroy((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }
      res.clearCookie("careerlens.sid");
      return res.status(204).send();
    });
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: error.message || "Internal server error" });
});

app.listen(port, () => {
  console.log(`CareerLens backend running on http://localhost:${port}`);
});
