const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const companiesRouter = require('./routes/companies');
const companyReportsRouter = require('./routes/companyReports');
const reportDetailsRouter = require('./routes/reportDetails');
const financialsRouter = require('./routes/financials');

const app = express();
app.use(cors());
app.use(express.json());

const uri = "mongodb://localhost:27017"; // adjust if using Docker
const client = new MongoClient(uri);

async function startServer() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db('stocks_data');
    
    app.use('/api/companies', companiesRouter(db));
    app.use('/api/company-reports', companyReportsRouter(db));
    app.use('/api/report-details', reportDetailsRouter(db));
    app.use('/api/financials', financialsRouter(db));


    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("Failed to start server:", err);
  }
}

startServer();
