import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Container, Row, Col, Spinner, Alert, Button } from 'react-bootstrap';

const CompanyReports = () => {
  const { ticker } = useParams();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {        
    const fetchReports = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/company-reports/${ticker}`);
        if (!response.ok) throw new Error('Failed to fetch reports');
        const data = await response.json();
        setReports(data);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [ticker]);

  if (loading) {
    return (
      <Container className="mt-5 text-center">
        <Spinner animation="border" />
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  if (reports.length === 0) {
    return (
      <Container className="mt-5">
        <Alert variant="info">No reports found for {ticker.toUpperCase()}</Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3>Reports for {ticker.toUpperCase()}</h3>
        <Link to="/companies">
          <Button variant="outline-dark" size="sm">Back to Companies</Button>
        </Link>
      </div>
      <Row>
        {reports.map((report) => (
          <Col md={6} lg={4} key={report._id} className="mb-4">
            <Card>
              <Card.Body>
                <Card.Title>{report['Form Type']}</Card.Title>
                <Card.Subtitle className="mb-2 text-muted">
                  Filing Date: {report['Filing date'] || 'N/A'}
                </Card.Subtitle>
                <Card.Text>
                  <strong>Report Date:</strong> {report['Report date'] || 'N/A'}
                  <br />
                  <strong>Primary Document:</strong> {report['Primary document'] || 'N/A'}
                </Card.Text>
                {report.url && (
                  <a href={report.url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline-dark" size="sm">View on SEC</Button>
                  </a>
                )}     

                <Link to={`/report-details/${report["File name"]}`}>
                  <Button variant="outline-dark" size="sm" className="mt-2">
                    View Extracted Report
                  </Button>
                </Link>           
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </Container>
  );
};

export default CompanyReports;