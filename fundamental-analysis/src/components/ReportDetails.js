import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container, Spinner, Alert, Card, Button } from 'react-bootstrap';

const ReportDetails = () => {
  const { fileName } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const response = await fetch(`http://localhost:5001/api/report-details/${fileName}`);
        if (!response.ok) throw new Error('Failed to fetch report details');

        const data = await response.json();
        setReport(data);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [fileName]);

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

  if (!report) {
    return (
      <Container className="mt-5">
        <Alert variant="info">No report found</Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3>{report.file_name}</h3>
        <Link to={`/company-reports/${report.ticker}`}>
          <Button variant="outline-dark" size="sm">Back to Reports</Button>
        </Link>
      </div>

      {Object.entries(report.sections).map(([sectionName, sectionText]) => (
        <Card key={sectionName} className="mb-4">
          <Card.Body>
            <Card.Title>{sectionName.toUpperCase()}</Card.Title>
            <Card.Text style={{ whiteSpace: 'pre-line' }}>
              {sectionText}
            </Card.Text>
          </Card.Body>
        </Card>
      ))}
    </Container>
  );
};

export default ReportDetails;