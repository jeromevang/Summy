/**
 * Login Form Component
 * 
 * BUG: XSS Vulnerability - User input is rendered using dangerouslySetInnerHTML
 * without proper sanitization.
 */

import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

interface LoginFormProps {
  onSuccess?: () => void;
  redirectUrl?: string;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, redirectUrl }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      const result = await login(email, password);
      
      if (result.success) {
        // BUG: XSS vulnerability - displaying user input without sanitization
        setWelcomeMessage(`Welcome back, ${result.user?.name || email}!`);
        onSuccess?.();
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-form">
      <h2>Login</h2>
      
      {/* BUG: XSS Vulnerability - rendering user-controlled content as HTML */}
      {welcomeMessage && (
        <div 
          className="welcome-message"
          dangerouslySetInnerHTML={{ __html: welcomeMessage }}
        />
      )}
      
      {error && (
        <div className="error-message" role="alert">
          {/* BUG: Error message could also contain malicious content */}
          <div dangerouslySetInnerHTML={{ __html: error }} />
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      
      <div className="form-footer">
        <a href="/forgot-password">Forgot password?</a>
        <a href="/register">Create account</a>
      </div>
    </div>
  );
};

export default LoginForm;

