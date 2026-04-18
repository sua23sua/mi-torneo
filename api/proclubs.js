// api/proclubs.js
// Vercel Serverless Function — proxy to EA Pro Clubs API

const EA_BASE = "https://proclubs.ea.com/api/fc";
const PLATFORMS = ["common-gen5", "common-gen4", "pc"];

async function fetchEA(path) {
  const res = await fetch(`${EA_BASE}${path}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://www.ea.com/",
      "Accept": "application/json",
    },
  });
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { action, clubId, platform, clubName, matchId } = req.query;

  // ── Search club by name across all platforms ──────────────────
  if (action === "search") {
    if (!clubName) return res.status(400).json({ error: "clubName required" });
    const results = [];
    await Promise.all(PLATFORMS.map(async (plat) => {
      const data = await fetchEA(`/clubs/search?platform=${plat}&clubName=${encodeURIComponent(clubName)}`);
      if (Array.isArray(data)) {
        data.forEach(club => results.push({
          clubId: club.clubId,
          name: club.name,
          platform: plat,
          platformLabel: plat === "common-gen5" ? "PS5 / Xbox Series" : plat === "common-gen4" ? "PS4 / Xbox One" : "PC",
          memberCount: club.memberCount || 0,
        }));
      }
    }));
    const seen = new Set();
    const unique = results.filter(r => {
      const key = `${r.clubId}_${r.platform}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    return res.status(200).json(unique);
  }

  // ── Get last 3 friendly matches for a club ───────────────────
  if (action === "matches") {
    if (!clubId || !platform) return res.status(400).json({ error: "clubId and platform required" });
    const data = await fetchEA(`/clubs/matches?platform=${platform}&matchType=friendlies&clubIds=${clubId}`);
    if (!data || !Array.isArray(data)) return res.status(200).json([]);

    const sorted = data
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 3);

    const matches = sorted.map(m => {
      const clubs = m.clubs || {};
      const clubKeys = Object.keys(clubs);
      const myKey  = clubKeys.find(k => String(k) === String(clubId));
      const oppKey = clubKeys.find(k => String(k) !== String(clubId));
      const myClub  = clubs[myKey]  || {};
      const oppClub = clubs[oppKey] || {};
      const myScore  = parseInt(myClub.goals  ?? myClub.score ?? 0);
      const oppScore = parseInt(oppClub.goals ?? oppClub.score ?? 0);
      return {
        matchId:   m.matchId || m.id || null,
        timestamp: m.timestamp || null,
        myName:    myClub.details?.name  || myClub.name  || "Mi equipo",
        oppName:   oppClub.details?.name || oppClub.name || "Rival",
        myScore,
        oppScore,
        scoreA: myScore,
        scoreB: oppScore,
      };
    });
    return res.status(200).json(matches);
  }

  // ── Get player stats for a specific match ────────────────────
  // Returns array of { proName, goals, assists, ratingAve, mom (MVP), positionIndex }
  if (action === "matchStats") {
    if (!matchId || !clubId || !platform) {
      return res.status(400).json({ error: "matchId, clubId and platform required" });
    }

    // EA endpoint for match details
    const data = await fetchEA(`/clubs/matches?platform=${platform}&matchType=friendlies&clubIds=${clubId}`);
    if (!data || !Array.isArray(data)) return res.status(200).json([]);

    // Find the specific match
    const match = data.find(m => String(m.matchId || m.id) === String(matchId));
    if (!match) return res.status(200).json([]);

    const clubs = match.clubs || {};
    const myKey = Object.keys(clubs).find(k => String(k) === String(clubId));
    if (!myKey) return res.status(200).json([]);

    const players = match.players?.[myKey] || {};

    const playerStats = Object.entries(players).map(([, p]) => ({
      proName:       p.proName   || p.playername || "",
      goals:         parseInt(p.goals        ?? 0),
      assists:       parseInt(p.assists       ?? 0),
      ratingAve:     parseFloat(p.ratingAve   ?? p.rating ?? 0).toFixed(1),
      mom:           p.mom === 1 || p.mom === "1" || p.manOfTheMatch === 1,
      positionIndex: parseInt(p.favoritePosition ?? p.positionIndex ?? 0),
      passesAttempted: parseInt(p.passesAttempted ?? 0),
      passesmade:    parseInt(p.passesmade ?? 0),
      tacklesmade:   parseInt(p.tacklesmade ?? 0),
      shotsongoal:   parseInt(p.shotsongoal ?? 0),
    })).filter(p => p.proName);

    return res.status(200).json(playerStats);
  }

  return res.status(400).json({ error: "Unknown action" });
}
