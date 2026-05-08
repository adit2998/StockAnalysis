import React from 'react';
import { Card, Table, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const FinancialsTab = ({ company }) => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="d-flex gap-2 mb-3">
        {['Income Statement', 'Balance Sheet', 'Cash Flow'].map((label) => (
          <Button key={label} variant="outline-secondary" size="sm">{label}</Button>
        ))}
      </div>
      <Card className="shadow-sm">
        <Card.Body>
          <div className="text-muted small mb-3">Annual · USD (millions)</div>
          <Table hover responsive size="sm" className="mb-0">
            <thead>
              <tr className="text-muted" style={{ fontSize: '0.85rem' }}>
                <th>Metric</th>
                <th className="text-end">FY 2021</th>
                <th className="text-end">FY 2022</th>
                <th className="text-end">FY 2023</th>
                <th className="text-end">FY 2024</th>
              </tr>
            </thead>
            <tbody>
              {['Revenue', 'Gross Profit', 'Operating Income', 'Net Income', 'EBITDA'].map((row) => (
                <tr key={row}>
                  <td>{row}</td>
                  {[0, 1, 2, 3].map((i) => (
                    <td key={i} className="text-end text-muted">--</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
      <div className="mt-3">
        <Button variant="outline-dark" size="sm" onClick={() => navigate(`/financials/${company.ticker}`)}>
          View Full Financials
        </Button>
      </div>
    </div>
  );
};

export default FinancialsTab;
