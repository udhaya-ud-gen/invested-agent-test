import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'iconoir-react';
import brandLogo from '../logoimage.png';
import './Landing.css';

const Landing = () => {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  return (
    <div className="landing-page">
      {/* Header */}
      <header className="landing-header fade-in">
        <div className="container">
          <div className="header-content">
            <img src={brandLogo} alt="InvestEd logo" className="logo-img header-logo" />
            <span className="logo-text brand-name" aria-label="InvestEd">
              <span className="logo-text-primary">Invest</span>
              <span className="logo-text-accent">Ed</span>
            </span>
            <button 
              className="btn btn-login"
              onClick={() => navigate('/login')}
            >
              Login
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="container">
          <div className="hero-content fade-in">
            <h1 className="hero-title">
              Powerful Admin Portal for
              <span className="gradient-text"> Stock Management</span>
            </h1>
            <p className="hero-description">
              Streamline your organization management, track licenses, and manage users 
              with our comprehensive admin platform designed for modern businesses.
            </p>
            <div className="hero-buttons">
              <button 
                className="btn btn-primary btn-lg"
                onClick={() => navigate('/login')}
              >
                Get Started
                <ArrowRight width={20} height={20} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container">
          <p>&copy; {currentYear} Invest<span className="brand-ed">Ed</span>. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
