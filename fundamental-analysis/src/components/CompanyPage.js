import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Card, Spinner, Alert, Nav } from 'react-bootstrap';
import OverviewTab from './tabs/OverviewTab';
import FinancialsTab from './tabs/FinancialsTab';
import FilingsTab from './tabs/FilingsTab';
import NewsTab from './tabs/NewsTab';

function truncateToSentences(text, max = 3) {
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.slice(0, max).join(' ').trim();
}

const CompanyPage = () => {
  const { ticker } = useParams();
  const [company, setCompany] = useState(null);
  const [description, setDescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logoError, setLogoError] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/companies/${ticker}`);
        if (!response.ok) throw new Error('Company not found');
        const data = await response.json();
        setCompany(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [ticker]);

  useEffect(() => {
    const fetchDescription = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/companies/${ticker}/description`);
        if (!response.ok) return;
        const data = await response.json();
        setDescription(data.description);
      } catch {
        // description is non-critical, fail silently
      }
    };

    fetchDescription();
  }, [ticker]);

  if (loading) return <Spinner animation="border" className="m-4" />;
  if (error) return <Alert variant="danger" className="m-4">{error}</Alert>;

  const logoUrl = `https://financialmodelingprep.com/image-stock/${company.ticker}.png`;

  return (
    <Container className="mt-4">
      {/* Header */}
      <Card className="mb-4 shadow-sm">
        <Card.Body className="p-4">
          {/* Top row: logo + name / price */}
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-4">
            <div className="d-flex align-items-center gap-4">
              <div style={{
                width: 80, height: 80, borderRadius: 16,
                background: '#e8f0fe', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {!logoError ? (
                  <img
                    src={logoUrl}
                    alt={company.ticker}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3d5afe' }}>
                    {company.ticker}
                  </span>
                )}
              </div>

              <div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2 }}>{company.name}</div>
                <div className="text-muted mt-1" style={{ fontSize: '0.92rem' }}>
                  --: {company.ticker}&nbsp;·&nbsp;{company.sicDescription}&nbsp;·&nbsp;--
                </div>
              </div>
            </div>

            {/* Right: price block */}
            <div className="text-end">
              <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1.1 }}>$--</div>
              <div style={{ color: '#28a745', fontWeight: 600, fontSize: '1rem' }}>+$-- +--% </div>
              <div className="text-muted" style={{ fontSize: '0.85rem' }}>Market cap $--</div>
            </div>
          </div>

          {/* Description */}
          {description && (
            <>
              <hr className="my-3" />
              <p className="mb-0" style={{ fontSize: '0.95rem', color: '#333', lineHeight: 1.6 }}>
                {truncateToSentences(description, 3)}
              </p>
            </>
          )}
        </Card.Body>
      </Card>

      {/* Tab Navigation */}
      <Nav
        variant="underline"
        activeKey={activeTab}
        onSelect={setActiveTab}
        className="mb-4"
        style={{ borderBottom: '1px solid #dee2e6' }}
      >
        {['overview', 'financials', 'filings', 'news'].map((tab) => (
          <Nav.Item key={tab}>
            <Nav.Link
              eventKey={tab}
              style={{
                textTransform: 'capitalize',
                color: activeTab === tab ? '#0d6efd' : '#555',
                fontWeight: activeTab === tab ? 600 : 400,
                paddingBottom: '0.6rem',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Nav.Link>
          </Nav.Item>
        ))}
      </Nav>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab company={company} />}
      {activeTab === 'financials' && <FinancialsTab company={company} />}
      {activeTab === 'filings' && <FilingsTab company={company} />}
      {activeTab === 'news' && <NewsTab company={company} />}

    </Container>
  );
};

export default CompanyPage;