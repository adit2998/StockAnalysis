import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Button, Container } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const CompaniesList = () => {
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch('http://localhost:5001/api/companies');
        if (!response.ok) {
          throw new Error('Failed to fetch tickers');
        }
        const data = await response.json();
        setCompanies(data);
      } catch (error) {
        setError(error.message);
      }
    };

    fetchCompanies();
  }, []);

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <Container className="mt-5">
      {/* Bootstrap Page Header */}
      <div className="mb-4">
        <h2 className="fw-bold">Companies Dashboard</h2>
        <p className="text-muted">Browse companies, view reports, and analyze financials</p>
      </div>

      <Row>
        {companies.map((company) => (
          <Col md={12} key={company.ticker} className="mb-3">
            <Card className="shadow-sm">
              <Card.Body className="d-flex justify-content-between align-items-center flex-wrap">

                {/* Left Section */}
                <div className="mb-2 mb-md-0">
                  <Card.Title className="mb-1">
                    {company.name} ({company.ticker})
                  </Card.Title>
                  <Card.Text className="text-muted mb-0">
                    {company.sicDescription}
                  </Card.Text>
                </div>

                {/* Right Section: Buttons */}
                <div className="d-flex gap-2">                  
                  <Button variant="outline-dark" onClick={() => navigate(`/companies/${company.ticker}`)}>View Details</Button>
                </div>                

              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </Container>
  );
};

export default CompaniesList;
