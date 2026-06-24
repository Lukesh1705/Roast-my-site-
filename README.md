# 🔥 Roast My Site

AI-powered website roaster. Paste a URL, get destroyed with **specific, personalized feedback** based on your actual site content.

## How it works

1. User enters a URL
2. Serverless function fetches the real HTML server-side
3. Extracts: H1s, H2s, meta description, OG tags, CTAs, alt texts, nav items, button copy, footer, word count, scripts, and more
4. Computes a real score based on actual checks (not random)
5. Sends all extracted content to Claude API
6. Claude reads the **actual content** and roasts it specifically

## Deploy to Vercel

### 1. Push to GitHub
Create a new repo and push this folder.

### 2. Import to Vercel
- Go to [vercel.com](https://vercel.com) → New Project
- Import your GitHub repo
- Framework preset: **Other**

### 3. Add your API key
In Vercel → Project Settings → Environment Variables:
```
ANTHROPIC_API_KEY = sk-ant-your-key-here
```

### 4. Deploy
Click Deploy. That's it.

## Local dev
```bash
npm install
npx vercel dev
```
Add your `ANTHROPIC_API_KEY` to a `.env.local` file.

## File structure
```
roast-my-site/
├── api/
│   └── roast.js        # Serverless function (fetches site + calls Claude)
├── public/
│   └── index.html      # Frontend
├── vercel.json         # Routing config
├── package.json
└── README.md
```
