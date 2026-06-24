const https = require("https");
const http = require("http");
const { URL } = require("url");

function fetchUrl(urlString, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error("Too many redirects"));
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      return reject(new Error("Invalid URL"));
    }
    const lib = parsed.protocol === "https:" ? https : http;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RoastBot/1.0; +https://roastmysite.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 12000,
    };
    const req = lib.request(options, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
        return resolve(fetchUrl(next, redirectCount + 1));
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
        if (data.length > 600000) res.destroy();
      });
      res.on("end", () => resolve({ html: data, status: res.statusCode, headers: res.headers }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.end();
  });
}

function extractSignals(html, url) {
  const signals = { url };

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  signals.title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : null;

  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  signals.metaDescription = metaDescMatch ? metaDescMatch[1].trim() : null;

  const metaKwMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i);
  signals.metaKeywords = metaKwMatch ? metaKwMatch[1].trim() : null;

  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  signals.ogTitle = ogTitle ? ogTitle[1] : null;
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  signals.ogDescription = ogDesc ? ogDesc[1] : null;
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  signals.hasOgImage = !!ogImage;

  signals.hasFavicon = /<link[^>]+(rel=["'][^"']*icon[^"']*["'])[^>]*>/i.test(html);

  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  signals.h1s = h1Matches.map(m => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(Boolean);

  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  signals.h2s = h2Matches.map(m => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 10);

  const btnMatches = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)];
  signals.buttons = btnMatches.map(m => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 15);

  const anchorMatches = [...html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)];
  signals.anchorTexts = anchorMatches.map(m => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(t => t.length > 1 && t.length < 80).slice(0, 30);

  const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i);
  if (navMatch) {
    const navAnchors = [...navMatch[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)];
    signals.navItems = navAnchors.map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  } else {
    signals.navItems = [];
  }

  const imgMatches = [...html.matchAll(/<img([^>]*)>/gi)];
  signals.totalImages = imgMatches.length;
  const alts = imgMatches.map(m => {
    const altM = m[1].match(/alt=["']([^"']*)["']/i);
    return altM ? altM[1].trim() : "__MISSING__";
  });
  signals.missingAltCount = alts.filter(a => a === "__MISSING__").length;
  signals.emptyAltCount = alts.filter(a => a === "").length;
  signals.sampleAlts = alts.filter(a => a !== "__MISSING__" && a !== "").slice(0, 8);

  const formMatches = [...html.matchAll(/<form[^>]*>/gi)];
  signals.formCount = formMatches.length;
  const inputMatches = [...html.matchAll(/<input[^>]*>/gi)];
  signals.inputCount = inputMatches.length;

  const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)];
  signals.externalScripts = scriptSrcs.map(m => m[1]).slice(0, 10);

  signals.hasGoogleAnalytics = /google-analytics\.com|gtag\(|ga\(/.test(html);
  signals.hasGTM = /googletagmanager\.com/.test(html);
  signals.hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  signals.hasCharset = /<meta[^>]+charset/i.test(html);

  const inlineStyleMatches = [...html.matchAll(/style=["'][^"']+["']/gi)];
  signals.inlineStyleCount = inlineStyleMatches.length;

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    const visibleText = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    signals.bodyTextSample = visibleText.slice(0, 3000);
    signals.wordCount = visibleText.split(/\s+/).filter(Boolean).length;
  }

  const footerMatch = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/i);
  if (footerMatch) {
    signals.footerText = footerMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  }

  const copyrightMatch = html.match(/©\s*(\d{4})/);
  signals.copyrightYear = copyrightMatch ? copyrightMatch[1] : null;

  signals.usesTailwind = /tailwind/i.test(html);
  signals.usesBootstrap = /bootstrap/i.test(html);
  signals.usesFontAwesome = /font-awesome|fontawesome/i.test(html);
  signals.isHttps = url.startsWith("https://");

  let score = 100;
  if (!signals.metaDescription) score -= 10;
  if (!signals.h1s.length) score -= 10;
  if (signals.h1s.length > 1) score -= 5;
  if (!signals.hasOgImage) score -= 5;
  if (!signals.ogTitle && !signals.ogDescription) score -= 5;
  if (!signals.hasFavicon) score -= 5;
  if (!signals.hasViewport) score -= 8;
  if (!signals.isHttps) score -= 10;
  if (signals.missingAltCount > 0) score -= Math.min(10, signals.missingAltCount * 2);
  if (!signals.hasGoogleAnalytics && !signals.hasGTM) score -= 3;
  if (signals.navItems.length > 8) score -= 5;
  if (signals.inlineStyleCount > 20) score -= 3;
  if (!signals.title) score -= 5;
  const weakCTAs = ["click here", "learn more", "read more", "submit", "click", "here"];
  const hasWeakCTA = [...(signals.buttons || []), ...(signals.anchorTexts || [])].some(t =>
    weakCTAs.includes(t.toLowerCase())
  );
  if (hasWeakCTA) score -= 5;
  if (signals.copyrightYear && parseInt(signals.copyrightYear) < new Date().getFullYear() - 1) score -= 3;
  signals.score = Math.max(5, Math.min(100, score));

  return signals;
}

async function callGroq(signals) {
  const prompt = `You are a brutally honest, witty, and specific website roast comedian. You've been given real extracted data from a live website. Your job is to roast it savagely but helpfully — like a senior developer and UX designer who's seen too many bad websites and has zero patience for mediocrity.

IMPORTANT: Be SPECIFIC. Reference the actual content you see below. Quote their actual words. Call out exact problems. Do NOT give generic advice. Every sentence should feel like it could ONLY apply to this specific website.

Here is the raw data extracted from the website at ${signals.url}:

PAGE TITLE: ${signals.title || "MISSING — they couldn't even be bothered"}
META DESCRIPTION: ${signals.metaDescription || "MISSING"}
META KEYWORDS: ${signals.metaKeywords || "none"}
OG TITLE: ${signals.ogTitle || "missing"}
OG DESCRIPTION: ${signals.ogDescription || "missing"}
HAS OG IMAGE: ${signals.hasOgImage}
HAS FAVICON: ${signals.hasFavicon}
HTTPS: ${signals.isHttps}
HAS VIEWPORT META: ${signals.hasViewport}
HAS CHARSET: ${signals.hasCharset}
HAS GOOGLE ANALYTICS: ${signals.hasGoogleAnalytics}
HAS GTM: ${signals.hasGTM}

H1 HEADINGS (${signals.h1s.length} found): ${JSON.stringify(signals.h1s)}
H2 HEADINGS: ${JSON.stringify(signals.h2s)}
NAV ITEMS (${signals.navItems.length}): ${JSON.stringify(signals.navItems)}
BUTTONS/CTAS: ${JSON.stringify(signals.buttons)}
ANCHOR TEXTS SAMPLE: ${JSON.stringify(signals.anchorTexts)}

IMAGES: ${signals.totalImages} total, ${signals.missingAltCount} missing alt text, ${signals.emptyAltCount} empty alt
SAMPLE ALT TEXTS: ${JSON.stringify(signals.sampleAlts)}

FORMS: ${signals.formCount} forms, ${signals.inputCount} inputs
INLINE STYLES: ${signals.inlineStyleCount} instances
USES TAILWIND: ${signals.usesTailwind}
USES BOOTSTRAP: ${signals.usesBootstrap}
COPYRIGHT YEAR: ${signals.copyrightYear || "none found"}
EXTERNAL SCRIPTS: ${JSON.stringify(signals.externalScripts.slice(0, 5))}

WORD COUNT: ${signals.wordCount || 0}
BODY TEXT SAMPLE: """${signals.bodyTextSample || ""}"""
FOOTER TEXT: ${signals.footerText || "none"}

COMPUTED SCORE: ${signals.score}/100

Now roast this website. Return ONLY valid JSON, no markdown, no backticks, no explanation:

{
  "score": ${signals.score},
  "verdict": "a 6-10 word savage one-liner verdict about this site",
  "opening": "2-3 sentences opening roast that references something SPECIFIC from their actual content",
  "roasts": [
    {
      "category": "category name (e.g. SEO, Copy, UX, Performance, Accessibility, Design, CTAs)",
      "issue": "specific issue title",
      "roast": "2-3 sentence specific roast quoting or referencing their actual content. Be savage but accurate."
    }
  ],
  "worstOffense": "the single most embarrassing thing about this specific site in 1-2 sentences",
  "oneThingToFixNow": "the most impactful change they should make TODAY, specific to what you saw",
  "backhanded_compliment": "one thing that's not terrible, framed as a backhanded compliment"
}

Include 4-7 roast items. Each must reference something SPECIFIC you saw in the data. Be funny, specific, and devastating.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1500,
      temperature: 0.85,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const text = data.choices[0].message.content;
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = "";
  await new Promise((resolve) => {
    req.on("data", (chunk) => (body += chunk));
    req.on("end", resolve);
  });

  let url;
  try {
    const parsed = JSON.parse(body);
    url = parsed.url;
    if (!url) throw new Error("No URL");
    if (!url.startsWith("http")) url = "https://" + url;
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Please provide a valid URL." });
  }

  try {
    const { html, status } = await fetchUrl(url);
    if (status >= 400) {
      return res.status(400).json({ error: `Site returned HTTP ${status}. Can't roast what doesn't exist.` });
    }
    const signals = extractSignals(html, url);
    const roast = await callGroq(signals);
    return res.status(200).json({ roast, signals });
  } catch (err) {
    console.error(err);
    if (err.message.includes("timed out")) {
      return res.status(504).json({ error: "Site took too long to respond. Even its server is embarrassed." });
    }
    if (err.message.includes("Invalid URL")) {
      return res.status(400).json({ error: "That URL looks broken. Ironic." });
    }
    return res.status(500).json({ error: "Something went wrong: " + err.message });
  }
};
