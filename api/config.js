// Exposes public front-end config. The OAuth Client ID is public by design
// (it's embedded in browser OAuth flows); the client secret is never used here.

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || ''
  });
};
