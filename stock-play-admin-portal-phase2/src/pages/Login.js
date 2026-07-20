import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Eye, EyeClosed } from 'iconoir-react';
import brandLogo from '../logoimage.png';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [emailValidation, setEmailValidation] = useState(''); // For email format validation message
  const { login } = useApp();
  const navigate = useNavigate();

  const validateEmail = (emailVal) => {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(emailVal);
  };

  const handleEmailChange = (e) => {
    const emailVal = e.target.value;
    setEmail(emailVal);
    
    if (emailVal.trim() === '') {
      setEmailValidation('');
    } else if (!validateEmail(emailVal)) {
      setEmailValidation('Invalid email format');
    } else {
      setEmailValidation('Valid email format');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate email format before submission
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    
    setLoading(true);
    
    try {
      const loggedInUser = await login(email, password);
      const isOrgAdmin = String(loggedInUser?.roleKey || '').toLowerCase() === 'org_admin' ||
        String(loggedInUser?.roleDisplayName || '').trim().toLowerCase() === 'org admin';
      navigate(isOrgAdmin ? '/my-organization' : '/dashboard');
    } catch (err) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container fade-in">
        <div className="login-header">
          <div className="login-logo">
            <img src={brandLogo} alt="InvestEd logo" className="login-logo-img" />
          </div>
          <p className="login-brand-text" aria-label="InvestEd">
            <span className="login-brand-primary">Invest</span>
            <span className="login-brand-accent">Ed</span>
          </p>
        </div>

        <form className="login-form" onSubmit={handleLogin} autoComplete="off">
          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={handleEmailChange}
              autoComplete="off"
              required
            />
            {emailValidation && (
              <div style={{ 
                fontSize: '12px', 
                marginTop: '4px',
                color: emailValidation === 'Invalid email format' ? '#ef4444' : '#10b981'
              }}>
                {emailValidation}
              </div>
            )}
          </div>

          <div className="input-group">
            <label>Password</label>
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeClosed width={20} height={20} strokeWidth={2} />
                ) : (
                  <Eye width={20} height={20} strokeWidth={2} />
                )}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>

          {error && (
            <div className="error-message" style={{ color: '#ef4444', marginTop: '12px', fontSize: '14px', textAlign: 'center' }}>
              {error}
            </div>
          )}
        </form>

        <div className="login-footer">
          <p>Use your portal user credentials to login</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
