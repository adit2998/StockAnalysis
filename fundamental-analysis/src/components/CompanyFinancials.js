import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from 'recharts';

const formatNumber = (num) => {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num;
};

const CompanyFinancials = () => {
  const { ticker } = useParams();
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFinancials = async () => {
      try {        
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/financials/${ticker}`);
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err.message);
      }
    };

    fetchFinancials();
  }, [ticker]);

  if (error) return <div>Error: {error}</div>;
  if (!data.length) return <div>Loading...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>{ticker} Financial Trends</h2>

      {data.map((metricDoc, index) => {
        const chartData = metricDoc.values.map(v => ({
          date: v.date,
          value: v.value
        }));

        return (
          <div key={index} style={{ marginBottom: '40px' }}>
            <h4>{metricDoc.metric}</h4>

            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(value) => formatNumber(value)} />
                <Tooltip formatter={(value) => formatNumber(value)} />
                <Line type="monotone" dataKey="value" stroke="#8884d8" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
};

export default CompanyFinancials;