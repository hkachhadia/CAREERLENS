const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";

const check = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name} -> ${error.message}`);
    process.exitCode = 1;
  }
};

await check("health endpoint", async () => {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) throw new Error(`status ${response.status}`);
  const body = await response.json();
  if (body.status !== "ok") throw new Error("unexpected health payload");
});

await check("benchmark score endpoint", async () => {
  const response = await fetch(`${API_BASE_URL}/api/analytics/benchmark-score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetRole: "Full Stack Developer",
      skills: ["React", "Node.js", "SQL", "Git"]
    })
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  const body = await response.json();
  if (typeof body.overallBenchmarkScore !== "number") {
    throw new Error("overallBenchmarkScore missing");
  }
});

await check("skills analytics endpoint", async () => {
  const response = await fetch(`${API_BASE_URL}/api/analytics/skills-score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Smoke Test User",
      role: "Full Stack Developer",
      skills: ["React", "Node.js", "SQL", "Problem Solving"],
      projects: ["CareerLift"],
      summary: "Built end-to-end full-stack apps."
    })
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  const body = await response.json();
  if (!body.analysis || typeof body.analysis.overallScore !== "number") {
    throw new Error("analysis score missing");
  }
});

if (process.exitCode && process.exitCode !== 0) {
  console.error("Smoke test suite completed with failures.");
} else {
  console.log("Smoke test suite completed successfully.");
}
