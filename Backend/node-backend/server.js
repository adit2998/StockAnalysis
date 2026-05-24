const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv-flow').config();
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const logger = require('./utils/logger');

const companiesRouter = require('./routes/companies');
const companyReportsRouter = require('./routes/companyReports');
const reportDetailsRouter = require('./routes/reportDetails');
const financialsRouter = require('./routes/financials');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const tierTemplatesRouter = require('./routes/tierTemplates');
const analysesRouter = require('./routes/analyses');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Sessions are only needed during the OAuth redirect handshake (Step 1 → Google → Step 2).
// After that, all auth is stateless JWT via the Authorization header.
app.use(session({
  secret: process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false },
}));
app.use(passport.initialize());
app.use(passport.session());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function startServer() {
  try {
    await client.connect();
    logger.info('Connected to MongoDB');

    const db = client.db(process.env.DB_NAME);

    // Google OAuth strategy: on first login, create the user; on subsequent logins, update their profile info
    passport.use(new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await db.collection('users').findOneAndUpdate(
            { googleId: profile.id },
            {
              $set: {
                googleId: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName,
              },
              $setOnInsert: {
                companies: [],
                generated_reports: [],
                total_spend_gbp: 0,
                monthly_spend: [],
              },
            },
            { upsert: true, returnDocument: 'after' }
          );
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    ));

    // Passport needs these to store/retrieve user from the session during the OAuth redirect chain
    passport.serializeUser((user, done) => done(null, user._id.toString()));
    passport.deserializeUser((id, done) => done(null, { _id: new ObjectId(id) }));

    app.use('/api/companies', companiesRouter(db));
    app.use('/api/company-reports', companyReportsRouter(db));
    app.use('/api/report-details', reportDetailsRouter(db));
    app.use('/api/financials', financialsRouter(db));
    app.use('/api/auth', authRouter());
    app.use('/api/users', usersRouter(db));
    app.use('/api/tier-templates', tierTemplatesRouter(db));
    app.use('/api/analyses', analysesRouter(db));

    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
  }
}

startServer();
