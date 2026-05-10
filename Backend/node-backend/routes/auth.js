const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');

module.exports = () => {
  const router = express.Router();

  // Step 1: redirect browser to Google's login page
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  // Step 2: Google redirects back here with an auth code; passport exchanges it for a profile,
  // we find-or-create the user in Mongo, then issue our own JWT and send it to the frontend
  router.get(
    '/google/callback',
    passport.authenticate('google', {
      failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=auth_failed`,
    }),
    (req, res) => {
      const token = jwt.sign(
        { userId: req.user._id.toString(), email: req.user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${encodeURIComponent(token)}`
      );
    }
  );

  return router;
};
