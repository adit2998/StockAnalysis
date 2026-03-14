import React from "react";
import { Container, Row, Col, Card, Button } from "react-bootstrap";

const CompaniesList = () => {

  // Temporary hardcoded data
  const companies = [
    { ticker: "AAPL", name: "Apple Inc." },
    { ticker: "MSFT", name: "Microsoft Corp." },
    { ticker: "GOOGL", name: "Alphabet Inc." },
    { ticker: "AMZN", name: "Amazon.com Inc." }
  ];

  return (
    <Container className="mt-4">
      <h2 className="mb-4">Companies</h2>

      <Row>
        {companies.map((company) => (
          <Col md={4} key={company.ticker} className="mb-4">
            <Card>
              <Card.Body>
                <Card.Title>{company.name}</Card.Title>
                <Card.Text>
                  Ticker: <strong>{company.ticker}</strong>
                </Card.Text>
                <Button variant="primary" href={`/company/${company.ticker}`}>
                  View Details
                </Button>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

    </Container>
  );
};

export default CompaniesList;