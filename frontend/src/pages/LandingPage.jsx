import React from "react";
import { Link } from "react-router-dom";

function LandingPage() {
  return (
    <section className="landing">
      <p className="eyebrow">AI-powered career guidance</p>
      <h1>Build your career path with confidence</h1>
      <p className="subtitle">
        CareerLens helps you discover skills, roles, and opportunities based on
        your goals and profile.
      </p>
      <div className="hero-actions">
        <Link to="/login" className="btn btn-primary">
          Get Started
        </Link>
        <Link to="/dashboard" className="btn btn-secondary">
          View Demo Dashboard
        </Link>
      </div>
    </section>
  );
}

export default LandingPage;
