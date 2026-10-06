// ── auth middleware ──────────────────────────────────────
const User = require('../models/User');

// Global gate: every page & API needs a session, except the
// login/setup pages themselves and static assets (served before this).
async function requireAuth(req, res, next) {
  try {
    if (req.path === '/login' || req.path === '/setup') return next();

    const users = await User.count();

    // First-run: no admin yet → force setup
    if (users === 0) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ ok: false, error: 'setup_required' });
      }
      return res.redirect('/setup');
    }

    if (req.session && req.session.user) return next();

    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    return res.redirect('/login');
  } catch (e) {
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ ok: false, error: 'auth_error' });
    }
    return res.redirect('/login');
  }
}

module.exports = { requireAuth };
