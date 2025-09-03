export default async function handler(req, res) {
  const { prompt = '' } = req.query || {};
  return res.status(200).json({
    ok: true,
    receivedPrompt: String(prompt),
    message: "Fresh deploy is working. We'll wire real game-gen next.",
    ts: new Date().toISOString()
  });
}
