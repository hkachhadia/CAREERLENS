import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { API_BASE_URL } from "../config";

function LoginPage() {
  const location = useLocation();
  const authError = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("error");
  }, [location.search]);
  const oauthDebug = useMemo(() => {
    if (!authError) return "";
    if (authError.includes("not_configured")) {
      return "OAuth provider is not configured on backend. Set provider keys in Render environment variables.";
    }
    if (authError.includes("google_auth_failed")) {
      return "Google login failed. Verify Google OAuth redirect URI matches backend callback URL.";
    }
    if (authError.includes("github_auth_failed")) {
      return "GitHub login failed. Verify GitHub OAuth callback URL and client credentials.";
    }
    return "";
  }, [authError]);

  return (
    <section className="auth-card elevated">
      <h2>Sign in to CareerLift</h2>
      <p>Continue with your preferred provider to sync your profile.</p>
      {authError && (
        <p className="auth-error">
          Authentication failed ({authError}). Please try again.
        </p>
      )}
      {oauthDebug && <p className="auth-hint">{oauthDebug}</p>}
      <div className="oauth-actions">
        <a href={`${API_BASE_URL}/api/auth/google`} className="btn btn-primary full-width">
          Continue with Google
        </a>
        <a href={`${API_BASE_URL}/api/auth/github`} className="btn btn-secondary full-width">
          Continue with GitHub
        </a>
      </div>
      <p className="auth-caption">
        If login does not open provider consent, check backend `/api/auth/providers` status.
      </p>
    </section>
  );
}

export default LoginPage;
