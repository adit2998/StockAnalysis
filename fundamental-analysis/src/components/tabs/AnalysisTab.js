import React from 'react';
import { Card } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const AnalysisTab = ({ company }) => {
  const navigate = useNavigate();

  const handleNewAnalysis = () => {
    navigate(`/companies/${company.ticker}/new-analysis`, { state: { company } });
  };

  return (
    <div>
      <div className="d-flex align-items-start justify-content-between mb-3">
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Analysis reports</div>
          <div className="text-muted" style={{ fontSize: '0.875rem', marginTop: 2 }}>
            AI-generated fundamental analysis of {company.name} filings
          </div>
        </div>
        <button
          onClick={handleNewAnalysis}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.5rem 1.1rem',
            borderRadius: 8,
            border: '1.5px solid #dee2e6',
            background: '#fff',
            fontWeight: 500,
            fontSize: '0.9rem',
            cursor: 'pointer',
            color: '#111',
            whiteSpace: 'nowrap',
          }}
        >
          + New analysis
        </button>
      </div>

      <Card className="shadow-sm">
        <Card.Body className="text-center py-5">
          <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.3rem', color: '#111' }}>
            No analyses yet
          </div>
          <div className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Run your first analysis to get AI-powered insights from {company.name} filings.
          </div>
          <button
            onClick={handleNewAnalysis}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: 8,
              border: 'none',
              background: '#1a1a1a',
              color: '#fff',
              fontWeight: 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            + New analysis
          </button>
        </Card.Body>
      </Card>
    </div>
  );
};

export default AnalysisTab;
