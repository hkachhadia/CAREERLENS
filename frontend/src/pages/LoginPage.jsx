import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { API_BASE_URL } from "../config";

function LoginPage() {
  const location = useLocation();
  const authError = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("error");
  }, [location.search]);

  return (
    <section className="auth-card">
      <h2>Welcome back</h2>
      <p>Sign in with your preferred provider to continue.</p>
      {authError && (
        <p className="auth-error">
          Authentication failed ({authError}). Please try again.
        </p>
      )}
      <div className="oauth-actions">
        <a href={`${API_BASE_URL}/api/auth/google`} className="btn btn-primary full-width">
          Continue with Google
        </a>
        <a href={`${API_BASE_URL}/api/auth/github`} className="btn btn-secondary full-width">
          Continue with GitHub
        </a>
      </div>
    </section>
  );
}

export default LoginPage;
