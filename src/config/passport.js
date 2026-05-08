const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./db');

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE google_id = ?',
      [profile.id]
    );

    if (rows.length > 0) {
      return done(null, { ...rows[0], accessToken });
    }

    const [result] = await db.query(
      'INSERT INTO users (google_id, email, name, avatar) VALUES (?, ?, ?, ?)',
      [
        profile.id,
        profile.emails[0].value,
        profile.displayName,
        profile.photos[0].value,
      ]
    );

    const [newUser] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [result.insertId]
    );

    return done(null, { ...newUser[0], accessToken });
  } catch (err) {
    return done(err, null);
  }
}));

module.exports = passport;