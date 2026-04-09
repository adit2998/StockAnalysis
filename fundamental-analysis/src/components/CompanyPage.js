import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Card, Spinner, Alert, Row, Col, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const CompanyPage = () => {
  const { ticker } = useParams();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

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

  if (loading) return <Spinner animation="border" className="m-4" />;
  if (error) return <Alert variant="danger" className="m-4">{error}</Alert>;

  return (
    <Container className="mt-4">
      {/* Header */}
      <Card className="mb-4 shadow-sm">
        <Card.Body>
          <Card.Title style={{ fontSize: '1.5rem' }}>
            {company.name}
          </Card.Title>
          <Card.Subtitle className="text-muted">
            Ticker: {company.ticker}
          </Card.Subtitle>
        </Card.Body>
      </Card>

      {/* Details */}
      <Row>
        <Col md={6}>
          <Card className="p-3 shadow-sm mb-3">
            <strong>SIC Code</strong>
            <div>{company.sic}</div>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="p-3 shadow-sm mb-3">
            <strong>Industry</strong>
            <div>{company.sicDescription}</div>
          </Card>
        </Col>
      </Row>
      
    
    <div className="d-flex gap-2">                  
      <Button variant="outline-dark" onClick={() => navigate(`/companies/${company.ticker}/reports`)}>View Reports</Button>
    </div>

    <div className="d-flex gap-2">                  
      <Button variant="outline-dark" onClick={() => navigate(`/financials/${company.ticker}`)}>View Financials</Button>
    </div>

    </Container>
  );
};

export default CompanyPage;