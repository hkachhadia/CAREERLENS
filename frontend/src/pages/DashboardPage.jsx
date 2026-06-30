import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../config";

const DEFAULT_SKILLS = ["React", "Node.js", "SQL", "Git", "Problem Solving"];
const DEFAULT_PROJECTS = ["CareerLens Dashboard", "Portfolio Revamp"];
const REFRESH_INTERVAL_MS = 20000;

const buildTrendPath = (points, width, height) => {
  if (points.length === 0) return "";
  const safeHeight = height - 10;
  const safeWidth = width - 10;
  return points
    .map((point, index) => {
      const x = 5 + (index * safeWidth) / Math.max(1, points.length - 1);
      const y = 5 + ((100 - point) * safeHeight) / 100;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
};

function DashboardPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");
  const [role, setRole] = useState("Full Stack Developer");
  const [skillsInput, setSkillsInput] = useState(DEFAULT_SKILLS.join(", "));
  const [analysisData, setAnalysisData] = useState(null);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          method: "GET",
          credentials: "include"
        });
        if (!response.ok) {
          setCurrentUser(null);
          return;
        }
        const data = await response.json();
        setCurrentUser(data.user || null);
      } catch (_error) {
        setCurrentUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  const runAnalyticsRefresh = async () => {
    setAnalyticsError("");
    setIsAnalyticsLoading(true);
    try {
      const parsedSkills = skillsInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = {
        name: currentUser?.displayName || "CareerLens User",
        role,
        skills: parsedSkills.length ? parsedSkills : DEFAULT_SKILLS,
        projects: DEFAULT_PROJECTS,
        summary:
          "Actively building projects and preparing for role-aligned interviews with measurable progress."
      };

      const [analysisRes, benchmarkRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/analytics/skills-score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        }),
        fetch(`${API_BASE_URL}/api/analytics/benchmark-score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetRole: role,
            skills: payload.skills
          }),
          credentials: "include"
        })
      ]);

      if (!analysisRes.ok || !benchmarkRes.ok) {
        throw new Error("Failed to fetch live analytics");
      }

      const analysisJson = await analysisRes.json();
      const benchmarkJson = await benchmarkRes.json();
      const overallScore = analysisJson?.analysis?.overallScore ?? 0;

      setAnalysisData(analysisJson);
      setBenchmarkData(benchmarkJson);
      setHistory((prev) =>
        [...prev, { time: new Date().toLocaleTimeString(), value: overallScore }].slice(-12)
      );
    } catch (error) {
      setAnalyticsError(error.message || "Unable to load analytics");
    } finally {
      setIsAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    runAnalyticsRefresh();
    const timer = setInterval(runAnalyticsRefresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [role, skillsInput, currentUser?.displayName]);

  const handleLogout = async () => {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
    setCurrentUser(null);
  };

  const categoryScores = analysisData?.analysis?.categoryScores || {
    technical: 0,
    problemSolving: 0,
    communication: 0
  };
  const trendValues = history.map((item) => item.value);
  const trendPath = useMemo(() => buildTrendPath(trendValues, 420, 180), [trendValues]);

  return (
    <section className="dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Your Dashboard</h2>
          <p className="session-state">
            {isLoading
              ? "Checking secure session..."
              : currentUser
                ? `Signed in as ${currentUser.displayName || "User"} via ${currentUser.provider}`
                : "You are not signed in. Use the login page to start an OAuth session."}
          </p>
        </div>
        {currentUser ? (
          <button className="btn btn-secondary" onClick={handleLogout} type="button">
            Logout
          </button>
        ) : (
          <button className="btn btn-primary" type="button">
            Update Goals
          </button>
        )}
      </div>

      <article className="panel controls-panel">
        <h3>Real-time Analytics Controls</h3>
        <div className="controls-grid">
          <label>
            Target Role
            <input value={role} onChange={(event) => setRole(event.target.value)} />
          </label>
          <label>
            Skills (comma separated)
            <input
              value={skillsInput}
              onChange={(event) => setSkillsInput(event.target.value)}
              placeholder="React, Node.js, SQL, System Design"
            />
          </label>
          <button className="btn btn-primary" type="button" onClick={runAnalyticsRefresh}>
            Refresh Now
          </button>
        </div>
        {analyticsError && <p className="auth-error">{analyticsError}</p>}
      </article>

      <div className="dashboard-grid">
        <article className="panel">
          <h3>Overall Career Score</h3>
          <p className="metric">
            {isAnalyticsLoading ? "..." : `${analysisData?.analysis?.overallScore ?? 0}%`}
          </p>
          <p>
            Source: <strong>{analysisData?.analysis?.source || "n/a"}</strong>
          </p>
          <p>Updates every {REFRESH_INTERVAL_MS / 1000} seconds.</p>
        </article>

        <article className="panel">
          <h3>Benchmark Match</h3>
          <p className="metric">
            {isAnalyticsLoading ? "..." : `${benchmarkData?.overallBenchmarkScore ?? 0}%`}
          </p>
          <p>Coverage: {benchmarkData?.coverageScore ?? 0}%</p>
          <ul>
            {(benchmarkData?.suggestions || []).slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel wide-panel">
          <h3>Progress Graph (Live Trend)</h3>
          <div className="trend-chart">
            <svg viewBox="0 0 420 180" preserveAspectRatio="none" role="img">
              <path d="M 0 175 L 420 175" className="chart-axis" />
              {trendPath ? <path d={trendPath} className="chart-line" /> : null}
            </svg>
          </div>
          <div className="trend-meta">
            <span>Latest: {trendValues[trendValues.length - 1] ?? 0}%</span>
            <span>Samples: {trendValues.length}</span>
          </div>
        </article>

        <article className="panel wide-panel">
          <h3>Skill Breakdown</h3>
          <div className="score-bars">
            {Object.entries(categoryScores).map(([name, value]) => (
              <div key={name} className="score-row">
                <div className="score-label">
                  <span>{name}</span>
                  <strong>{value}%</strong>
                </div>
                <div className="progress-track">
                  <div className="progress-fill dynamic" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <h3>Top Matched Skills</h3>
          <ul>
            {(benchmarkData?.matchedSkills || []).slice(0, 4).map((item) => (
              <li key={item.skill}>
                {item.skill}: {item.readiness}%
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h3>Priority Gaps</h3>
          <ul>
            {(benchmarkData?.missingSkills || []).slice(0, 4).map((item) => (
              <li key={item.skill}>
                {item.skill} ({item.targetLevel})
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

export default DashboardPage;
