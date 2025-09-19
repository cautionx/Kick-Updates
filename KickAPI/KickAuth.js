const fetch = require("node-fetch"); 

let tokenData = null;

async function getKickToken() {
  if (tokenData && Date.now() < tokenData.expires_at) return tokenData.access_token;

  const res = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.KICK_CLIENT_ID,
      client_secret: process.env.KICK_CLIENT_SECRET
    })
  });

  const data = await res.json();
  tokenData = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000
  };

  return tokenData.access_token;
}

module.exports = { getKickToken };
