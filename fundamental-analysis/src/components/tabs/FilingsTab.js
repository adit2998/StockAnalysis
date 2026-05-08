import React from 'react';
import { Card, Table, Button, Badge } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const FILINGS = [
  { type: '10-K', desc: 'Annual Report', date: '--' },
  { type: '10-Q', desc: 'Quarterly Report', date: '--' },
  { type: '8-K', desc: 'Current Report', date: '--' },
  { type: 'DEF 14A', desc: 'Proxy Statement', date: '--' },
];

const FilingsTab = ({ company }) => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="text-muted small">Recent SEC filings for {company.ticker}</div>
        <Button variant="outline-dark" size="sm" onClick={() => navigate(`/companies/${company.ticker}/reports`)}>
          View All Reports
        </Button>
      </div>
      <Card className="shadow-sm">
        <Table hover responsive className="mb-0">
          <thead>
            <tr className="text-muted" style={{ fontSize: '0.85rem' }}>
              <th>Type</th>
              <th>Description</th>
              <th>Filed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {FILINGS.map(({ type, desc, date }) => (
              <tr key={type}>
                <td><Badge bg="secondary" style={{ fontWeight: 500 }}>{type}</Badge></td>
                <td>{desc}</td>
                <td className="text-muted">{date}</td>
                <td className="text-end">
                  <Button variant="link" size="sm" className="p-0 text-primary">View ↗</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
};

export default FilingsTab;
