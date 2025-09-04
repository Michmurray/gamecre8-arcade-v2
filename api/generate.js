export default async function handler(req, res) {
  try {
    const prompt = String((req.query?.prompt ?? '') || '');
    const p = prompt.toLowerCase();
    const has = (...words) => words.some(w => p.includes(w));

    // ---------- Base gameplay config from keywords ----------
    let speed = 3;
    if (has('fast','speed','runner','dash','ninja','quick')) speed = 5;
    if (has('slow','chill','cozy')) speed = 2.5;

    let gravity = 0.7;
    if (has('space','moon','low gravity','low-gravity','galaxy')) gravity = 0.4;
    if (has('underwater','water','swim','float')) gravity = 0.5;
    if (has('heavy','hardcore')) gravity = 0.9;

    let theme = (has('dark','night','space','galaxy') ? 'dark' : 'light');

    let platformRate = 0.06;
    if (has('platformer','parkour','jump')) platformRate = 0.08;
    if (has('open world','open-world','endless')) platformRate = 0.05;

    let coinRate = 0.05;
    if (has('collect','coin','ring','rings','gems','collectibles')) coinRate = 0.08;
    if (has('easy','kids','kid-friendly')) coinRate = 0.09;

    let hazardRate = 0.03;
    if (has('lava','spike','enemy','bullet','trap','hard','difficult')) hazardRate = 0.05;
    if (has('easy','kids','kid-friendly','cozy')) hazardRate = 0.015;

    let jump = 12;
    if (has('parkour','ninja','high jump','high-jump','bouncy')) jump = 14;
    if (gravity < 0.6) jump = Math.max(jump, 13);

    // ---------- Load manifest over HTTP from this deployment ----------
    const proto = (req.headers['x-forwarded-proto'] || 'https');
    const host  = req.headers.host;
    const url   = `${proto}://${host}/assets/manifest.json`;

    let manifest = null;
    try {
      const r = await fetch(url);
      if (r.ok) manifest = await r.json();
    } catch {}

    // ---------- Choose best-matching assets by tag overlap ----------
    function pick(items) {
      if (!Array.isArray(items) || items.length === 0) return null;
      let best = items[0], bestScore = -1;
      for (const it of items) {
        const tags = (it.tags || []).map(t => String(t).toLowerCase());
        const score = tags.reduce((s, t) => s + (p.includes(t) ? 1 : 0), 0);
        if (score > bestScore) { bestScore = score; best = it; }
      }
      return best;
    }

    const chosenBg     = manifest ? pick(manifest.backgrounds) : null;
    const chosenPlayer = manifest ? pick(manifest.players)    : null;

    const config = {
      speed, gravity, theme, platformRate, coinRate, hazardRate, jump,
      assets: {
        background: chosenBg?.path || null,
        player:     chosenPlayer?.path || null
      }
    };

    res.status(200).json({
      ok: true,
      message: 'Config+assets generated from prompt',
      prompt,
      config,
      ts: new Date().toISOString()
    });
  } catch {
    res.status(200).json({
      ok: true,
      message: 'Default config (API error handled)',
      prompt: String(req.query?.prompt ?? ''),
      config: {
        speed:3, gravity:0.7, theme:'light',
        platformRate:0.06, coinRate:0.05, hazardRate:0.03, jump:12,
        assets: { background:null, player:null }
      },
      ts: new Date().toISOString()
    });
  }
}
