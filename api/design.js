// api/design.js
// Produces a "design spec" from a prompt OR at random using available assets.
// No external API; uses heuristics + randomness on /assets/manifest.json.
export default async function handler(req, res) {
  const q = (req.query && (req.query.prompt||"")) || "";
  const prompt = String(q);
  const P = prompt.toLowerCase();
  const proto = (req.headers["x-forwarded-proto"] || "https");
  const host  = req.headers.host;

  // fetch manifest
  let manifest=null;
  try{
    const r = await fetch(`${proto}://${host}/assets/manifest.json`);
    if(r.ok) manifest = await r.json();
  }catch{}
  const backgrounds = Array.isArray(manifest?.backgrounds) ? manifest.backgrounds : [];
  const players     = Array.isArray(manifest?.players)     ? manifest.players     : [];

  function tokset(s){ return new Set(String(s).replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(Boolean)); }
  const WORDS = tokset(P);

  const THEMES = [
    {key:"space",  tags:["space","galaxy","cosmos","star","sci-fi","scifi"]},
    {key:"forest", tags:["forest","woods","trees","grass"]},
    {key:"desert", tags:["desert","sand","dunes","hot"]},
    {key:"castle", tags:["castle","medieval","stone"]},
    {key:"water",  tags:["water","ocean","sea","underwater"]},
    {key:"city",   tags:["city","urban","street"]},
    {key:"fall",   tags:["fall","autumn","orange","leaf","leaves"]}
  ];
  const ACTORS = [
    {key:"soldier", tags:["soldier","army","military","rifle","troop","gun"]},
    {key:"zombie",  tags:["zombie","undead","ghoul","horror"]},
    {key:"alien",   tags:["alien","ufo","ship","spaceship","drone","bug","monster","enemy","bird","robot"]}
  ];
  function hasAny(arr){ return arr.some(w=>WORDS.has(w)); }

  // pick theme from prompt else weighted by backgrounds
  let theme = null;
  for(const t of THEMES){ if(hasAny(t.tags)){ theme=t.key; break; } }
  if(!theme){
    // weight by how many backgrounds match each theme
    const weights = THEMES.map(t=>{
      const c = backgrounds.filter(b=>(b.tags||[]).some(x=>t.tags.includes(String(x).toLowerCase()))).length;
      return {t, w: Math.max(1,c)};
    });
    const sum = weights.reduce((a,b)=>a+b.w,0);
    let r = Math.random()*sum;
    for(const item of weights){ if((r-=item.w)<=0){ theme=item.t.key; break; } }
    if(!theme) theme="forest";
  }

  // choose background favoring theme
  function pickBg(){
    const themed = backgrounds.filter(b=>(b.tags||[]).map(String).map(x=>x.toLowerCase()).some(t=>t.includes(theme)));
    const pool = themed.length?themed:backgrounds;
    return pool.length? pool[Math.floor(Math.random()*pool.length)] : null;
  }

  // choose player favoring actor words (soldier/zombie/alien), else any
  let role = null;
  for(const a of ACTORS){ if(hasAny(a.tags)){ role=a.key; break; } }
  function pickPlayer(){
    const prefTags = role ? ACTORS.find(a=>a.key===role).tags : [];
    const match = players.filter(p=>(p.tags||[]).map(String).map(x=>x.toLowerCase()).some(t=>prefTags.includes(t)));
    const pool = match.length? match : players;
    return pool.length? pool[Math.floor(Math.random()*pool.length)] : null;
  }

  const bg = pickBg();
  const pl = pickPlayer();

  // gameplay knobs inferred from theme + prompt
  let speed = /fast|runner|dash|quick/.test(P) ? 5 : (/slow|chill|cozy/.test(P) ? 2.5 : 3);
  let gravity = 0.7; if (theme==="space") gravity=0.4; if (theme==="water") gravity=0.5; if (/heavy|hardcore/.test(P)) gravity=0.9;
  let themeMode = (theme==="space" || /night|dark|noir|midnight|horror/.test(P)) ? "dark" : "light";
  let platformRate = /platformer|parkour|jump/.test(P) ? 0.08 : 0.06;
  let coinRate = /collect|coin|ring|gems|kids|kid|cozy/.test(P) ? 0.08 : 0.05;
  let hazardRate = /lava|spike|enemy|bullet|trap|hard|difficult/.test(P) ? 0.05 : (/kids|kid|cozy/.test(P)?0.015:0.03);
  let jump = /parkour|ninja|high|bouncy/.test(P) ? 14 : 12; if (gravity<0.6) jump = Math.max(jump,13);

  res.status(200).json({
    ok:true,
    design:{
      promptUsed: prompt,
      theme,
      role: role || "enemy",
      tags:{ bg:[theme], player:[role||"enemy"] },
      knobs:{ speed, gravity, theme: themeMode, platformRate, coinRate, hazardRate, jump },
      chosen:{ backgroundId: bg?.id || null, playerId: pl?.id || null }
    },
    counts:{ backgrounds: backgrounds.length, players: players.length },
    ts: new Date().toISOString()
  });
}
