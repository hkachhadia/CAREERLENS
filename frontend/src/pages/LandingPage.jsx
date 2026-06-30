import React from "react";
import { Link } from "react-router-dom";

function LandingPage() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">AI-powered career growth</p>
        <h1>Turn your skills into a clear career roadmap</h1>
        <p className="subtitle">
          CareerLift analyzes your coding profiles, benchmarks your readiness,
          and gives role-focused next steps in real time.
        </p>
        <div className="hero-actions">
          <Link to="/login" className="btn btn-primary">
            Start Free Analysis
          </Link>
          <Link to="/dashboard" className="btn btn-secondary">
            Open Live Dashboard
          </Link>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <h3>Skill Gap Detection</h3>
          <p>Compare your profile with target role benchmarks instantly.</p>
        </article>
        <article className="feature-card">
          <h3>Live Progress Metrics</h3>
          <p>Track score trend, category strengths, and priority gaps.</p>
        </article>
        <article className="feature-card">
          <h3>Profile Integrations</h3>
          <p>Connect GitHub and coding profiles for richer recommendations.</p>
        </article>
      </section>
    </>
  );
}

export default LandingPage;
