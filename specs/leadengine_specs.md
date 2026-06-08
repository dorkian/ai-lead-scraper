# LeadEngine — Full Implementation Specs & UI Plan

> A multi-source AI lead generation system powered by Claude Agent SDK, PRAW, Google Maps, and Gmail. Zero monthly cost beyond your existing $20 Claude Pro plan.

---

## Overview

LeadEngine is a Python CLI + FastAPI web app that:
1. Pulls leads from Reddit, Google Maps, and company websites
2. Uses Claude Agent SDK (free via subscription credit) to extract emails, qualify leads, and write cold emails
3. Sends personalized cold emails via Gmail SMTP
4. Tracks everything in a local SQLite database

**Total new infrastructure cost: €0/month**

---

## Phase 1 — Core Engine (CLI only, no UI)

**Goal:** Working pipeline from lead source → email sent, entirely in Python CLI.

**Duration estimate:** 2–3 days

### 1.1 Project Setup

```
lead-engine/
├── main.py
├── config.yaml
├── requirements.txt
├── .env
├── sources/
├── agents/
├── storage/
└── sender/
```

**`config.yaml` schema:**
```yaml
product:
  name: "PipelineDock"
  description: "Workflow automation for small agencies"
  value_prop: "Save 10 hours/week on repetitive client tasks"

target:
  role: "Agency Owner"
  industry: "Marketing Agency"
  company_size: "1-20 employees"
  location: "Italy"
  pain_points:
    - "too many manual client reports"
    - "repetitive onboarding tasks"

outreach:
  sender_name: "Your Name"
  sender_email: "you@gmail.com"
  daily_limit: 30
  timezone: "Europe/Rome"
```

**`requirements.txt`:**
```
anthropic
praw
googlemaps
httpx
dnspython
python-dotenv
pyyaml
sqlite-utils
```

**`.env`:**
```
ANTHROPIC_API_KEY=your_key   # or use claude-code session
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
GOOGLE_MAPS_API_KEY=...
GMAIL_APP_PASSWORD=...
```

### 1.2 Storage Layer — `storage/db.py`

SQLite with 3 tables:

**`leads` table:**
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto |
| source | TEXT | "reddit", "gmaps", "website" |
| name | TEXT | contact name |
| company | TEXT | company name |
| domain | TEXT | company website |
| email | TEXT | found email |
| email_verified | BOOLEAN | SMTP check result |
| iq_score | INTEGER | AI qualification 1-10 |
| status | TEXT | "new","qualified","emailed","replied","rejected" |
| raw_data | JSON | original source payload |
| created_at | DATETIME | |

**`emails_sent` table:**
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| lead_id | INTEGER FK | |
| subject | TEXT | |
| body | TEXT | |
| sent_at | DATETIME | |
| opened | BOOLEAN | (future) |
| replied | BOOLEAN | manual update |

**`runs` table:**
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| source | TEXT | which source was used |
| leads_found | INTEGER | |
| leads_qualified | INTEGER | |
| emails_sent | INTEGER | |
| run_at | DATETIME | |

### 1.3 Source: Google Maps — `sources/gmaps_source.py`

```python
import googlemaps

def fetch_leads(config: dict, max_results: int = 50) -> list[dict]:
    gmaps = googlemaps.Client(key=GOOGLE_MAPS_API_KEY)
    query = f"{config['target']['industry']} in {config['target']['location']}"
    results = gmaps.places(query=query)
    leads = []
    for place in results['results'][:max_results]:
        detail = gmaps.place(place['place_id'], fields=['name','website','formatted_phone_number'])
        leads.append({
            "source": "gmaps",
            "company": detail['result'].get('name'),
            "domain": extract_domain(detail['result'].get('website', '')),
            "raw_data": detail['result']
        })
    return leads
```

**Output:** List of companies with name + domain. Email found in Phase 1.4.

### 1.4 Email Extraction Agent — `agents/email_extractor.py`

3-step waterfall — tries each until email found:

**Step 1: Scrape company website**
```python
import httpx, re

async def scrape_website_email(domain: str) -> str | None:
    for path in ['', '/contact', '/about', '/team', '/contact-us']:
        try:
            r = await httpx.AsyncClient().get(f"https://{domain}{path}", timeout=10)
            emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', r.text)
            real = [e for e in emails if not e.endswith(('.png','.jpg','.css'))]
            if real:
                return real[0]
        except:
            continue
    return None
```

**Step 2: AI extraction from raw HTML (Claude Agent SDK)**
```python
from anthropic import Anthropic

client = Anthropic()  # uses Agent SDK credit

def ai_extract_email(html: str, domain: str) -> str | None:
    msg = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=100,
        messages=[{"role": "user", "content": 
            f"Extract the primary business contact email from this HTML for domain {domain}. "
            f"Return ONLY the email or 'NOT_FOUND'.\n\nHTML:\n{html[:4000]}"}]
    )
    result = msg.content[0].text.strip()
    return None if result == 'NOT_FOUND' else result
```

**Step 3: AI email pattern guesser**
```python
def ai_guess_email(name: str, domain: str) -> list[str]:
    msg = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=150,
        messages=[{"role": "user", "content":
            f"Given person name '{name}' and domain '{domain}', list the 3 most likely "
            f"business email addresses as a JSON array. Example: ['john@acme.com','j.doe@acme.com']"}]
    )
    import json
    return json.loads(msg.content[0].text.strip())
```

### 1.5 SMTP Email Verifier — `agents/email_verifier.py`

Zero-send SMTP handshake — just knocks on the server door:

```python
import smtplib, dns.resolver

def verify_email(email: str) -> bool:
    domain = email.split('@')[1]
    try:
        mx = dns.resolver.resolve(domain, 'MX')
        mx_host = str(mx[0].exchange)
        with smtplib.SMTP(mx_host, 25, timeout=10) as s:
            s.helo('verifier.local')
            s.mail('verify@verifier.local')
            code, _ = s.rcpt(email)
            return code == 250
    except:
        return False
```

### 1.6 Lead Qualifier Agent — `agents/lead_qualifier.py`

```python
def qualify_lead(lead: dict, config: dict) -> tuple[int, str]:
    msg = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=200,
        messages=[{"role": "user", "content": f"""
You are a B2B sales qualifier. Score this lead 1-10 for fit.

PRODUCT: {config['product']['description']}
TARGET: {config['target']['role']} at {config['target']['industry']}
PAIN POINTS: {config['target']['pain_points']}

LEAD:
Company: {lead['company']}
Domain: {lead['domain']}

Respond as JSON: {{"score": 8, "reason": "matches ICP perfectly because..."}}
"""}]
    )
    import json
    result = json.loads(msg.content[0].text.strip())
    return result['score'], result['reason']
```

Only leads scoring **≥ 7** proceed to email writing.

### 1.7 Cold Email Writer Agent — `agents/email_writer.py`

```python
def write_cold_email(lead: dict, config: dict) -> tuple[str, str]:
    msg = client.messages.create(
        model="claude-sonnet-4-5",   # better quality for outreach
        max_tokens=500,
        messages=[{"role": "user", "content": f"""
Write a cold outreach email. Rules:
- Max 3 short paragraphs
- Personal opener referencing their business specifically
- One clear value prop sentence
- Soft CTA (15-min call, not a demo)
- No buzzwords, no pushy language
- Sign as {config['outreach']['sender_name']}

SENDER PRODUCT: {config['product']['name']} — {config['product']['value_prop']}
RECIPIENT: {lead['name'] or 'there'} at {lead['company']} ({lead['domain']})

Return JSON: {{"subject": "...", "body": "..."}}
"""}]
    )
    import json
    result = json.loads(msg.content[0].text.strip())
    return result['subject'], result['body']
```

### 1.8 Gmail Sender — `sender/gmail_sender.py`

```python
import smtplib
from email.mime.text import MIMEText

def send_email(to: str, subject: str, body: str, config: dict):
    msg = MIMEText(body + "\n\n---\nTo unsubscribe reply STOP")
    msg['Subject'] = subject
    msg['From'] = config['outreach']['sender_email']
    msg['To'] = to
    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as s:
        s.login(config['outreach']['sender_email'], GMAIL_APP_PASSWORD)
        s.send_message(msg)
```

### 1.9 Main CLI Orchestrator — `main.py`

```python
# python main.py --source gmaps --limit 20 --dry-run
import argparse, yaml
from sources.gmaps_source import fetch_leads
from agents.email_extractor import extract_email_waterfall
from agents.email_verifier import verify_email
from agents.lead_qualifier import qualify_lead
from agents.email_writer import write_cold_email
from sender.gmail_sender import send_email
from storage.db import save_lead, save_email_sent, check_duplicate

def run_pipeline(source: str, limit: int, dry_run: bool):
    config = yaml.safe_load(open('config.yaml'))
    leads = fetch_leads(config, max_results=limit)
    for lead in leads:
        if check_duplicate(lead['domain']):
            continue
        email = extract_email_waterfall(lead['domain'])
        if not email:
            continue
        if not verify_email(email):
            continue
        lead['email'] = email
        score, reason = qualify_lead(lead, config)
        lead['iq_score'] = score
        save_lead(lead)
        if score < 7:
            continue
        subject, body = write_cold_email(lead, config)
        if not dry_run:
            send_email(email, subject, body, config)
            save_email_sent(lead['id'], subject, body)
            print(f"✅ Sent to {email} ({lead['company']}) score={score}")
        else:
            print(f"[DRY RUN] Would send to {email} — {subject}")
```

**Phase 1 complete when:** `python main.py --source gmaps --limit 10 --dry-run` runs end-to-end without errors.

---

## Phase 2 — Reddit Source

**Goal:** Add Reddit as a second lead channel. Leads come from people posting pain points.

**Duration estimate:** 1 day

### 2.1 PRAW Setup

Register a free Reddit app at `https://www.reddit.com/prefs/apps` (script type). Add to `.env`.

### 2.2 Reddit Source — `sources/reddit_source.py`

```python
import praw

def fetch_leads(config: dict, max_results: int = 30) -> list[dict]:
    reddit = praw.Reddit(client_id=..., client_secret=..., user_agent="leadbot/1.0")
    pain_keywords = config['target']['pain_points']
    target_subs = ["entrepreneur", "smallbusiness", "startups", "marketing"]
    leads = []
    for keyword in pain_keywords:
        for sub in target_subs:
            for post in reddit.subreddit(sub).search(keyword, limit=10):
                author = post.author
                if not author:
                    continue
                # Check author bio for website/email
                user = reddit.redditor(author.name)
                leads.append({
                    "source": "reddit",
                    "name": author.name,
                    "company": None,
                    "domain": extract_domain_from_bio(user),
                    "raw_data": {"post_title": post.title, "post_url": post.url}
                })
    return leads
```

**AI Step:** If no domain in bio, prompt Claude to infer company from username + post content.

---

## Phase 3 — FastAPI Web UI Backend

**Goal:** Replace CLI with a web API that the UI (Phase 4) talks to.

**Duration estimate:** 1–2 days

### 3.1 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get current config.yaml |
| POST | `/api/config` | Save updated config |
| POST | `/api/run` | Start pipeline (source, limit, dry_run) |
| GET | `/api/leads` | List all leads with filters |
| GET | `/api/leads/{id}` | Single lead detail |
| PATCH | `/api/leads/{id}` | Update status manually |
| GET | `/api/emails` | List sent emails |
| GET | `/api/stats` | Dashboard stats |
| GET | `/api/run/status` | Current pipeline run progress (SSE stream) |

### 3.2 Stats Endpoint Response

```json
{
  "total_leads": 142,
  "qualified_leads": 67,
  "emails_sent": 45,
  "open_rate": 0.31,
  "reply_rate": 0.08,
  "leads_by_source": {"gmaps": 90, "reddit": 52},
  "emails_this_week": 12,
  "top_industries": ["Marketing Agency", "SaaS", "E-commerce"]
}
```

### 3.3 SSE Progress Stream

For real-time pipeline feedback to the UI:

```python
@app.get("/api/run/status")
async def run_status():
    async def event_stream():
        async for event in pipeline_events:
            yield f"data: {json.dumps(event)}\n\n"
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

Events format:
```json
{"step": "fetch", "source": "gmaps", "count": 20, "message": "Found 20 companies"}
{"step": "email_find", "domain": "acme.it", "found": true}
{"step": "qualify", "company": "Acme SRL", "score": 8}
{"step": "send", "email": "info@acme.it", "status": "sent"}
```

---

## Phase 4 — Frontend UI

**Goal:** Clean, functional dashboard with config management, lead pipeline view, and send controls.

**Duration estimate:** 1–2 days (build in Claude Design / vanilla HTML)

### 4.1 UI Pages & Screens

**5 core screens:**

#### Screen 1: Dashboard (Home)
- KPI cards: Total Leads, Qualified, Emails Sent, Reply Rate
- Recent activity feed (last 10 actions)
- Quick "Run Pipeline" button with source selector
- Chart: leads found per day (7 days)

#### Screen 2: Configure
- Product info form (name, description, value prop)
- Target ICP form (role, industry, company size, location)
- Pain points (add/remove tags)
- Outreach settings (sender name, email, daily limit)
- Save button → POST /api/config

#### Screen 3: Leads Table
- Filterable table: All / New / Qualified / Emailed / Replied
- Columns: Company, Domain, Email, Source, Score, Status, Date
- Click row → Lead Detail modal
- Bulk actions: Qualify selected, Email selected, Reject selected

#### Screen 4: Lead Detail (Modal/Sidebar)
- Company info + domain link
- AI qualification score (1-10) with reason
- Email extraction method used (website/AI/guess)
- Email verification status badge
- Preview of cold email written
- Action buttons: Send Email / Reject / Mark Replied

#### Screen 5: Pipeline Runner (Live)
- Source selector toggle (Google Maps / Reddit / Both)
- Limit input (how many leads to process)
- Dry Run toggle
- "Run Now" button
- Live progress feed (SSE stream → animated log)
- Per-step status: Fetch → Extract Email → Verify → Qualify → Write → Send

### 4.2 UI Component Specs

**Color palette:** Dark sidebar + light content area (professional SaaS style)
- Background: `#0f1117` (dark sidebar), `#f7f6f2` (content area)
- Accent: Teal `#01696f`
- Score badges: Red < 5, Yellow 5-6, Green ≥ 7
- Source badges: Blue (gmaps), Orange (reddit), Purple (website)

**Typography:**
- Font: Geist or Satoshi (Fontshare)
- Sidebar nav: 14px medium
- KPI numbers: 32px bold (display font)
- Table rows: 14px regular

**Layout grid:**
```
┌──────────────────────────────────────────────────────┐
│ SIDEBAR (220px)  │  MAIN CONTENT AREA                │
│                  │                                    │
│ [Logo]           │  [Page Title]    [Action Buttons]  │
│                  │  ─────────────────────────────     │
│ • Dashboard      │                                    │
│ • Configure      │  [Content here]                    │
│ • Leads          │                                    │
│ • Run Pipeline   │                                    │
│                  │                                    │
│ [Stats footer]   │                                    │
└──────────────────┴────────────────────────────────────┘
```

**KPI Card spec:**
```
┌─────────────────────────┐
│  icon   TOTAL LEADS     │
│                         │
│    142                  │  ← big number
│    ↑ +12 this week      │  ← trend in muted text
└─────────────────────────┘
```

**Lead row spec:**
```
│ Acme SRL  │ acme.it │ info@acme.it │ 📍gmaps │ ●8 │ Qualified │ 19 May │ [Send] │
```

**Pipeline runner live log:**
```
● Fetching from Google Maps... (20 targets)
✓ acme.it — email found: info@acme.it (website scrape)
✓ info@acme.it — verified ✓
✓ Acme SRL — score: 8/10 — qualified
✓ Email sent to info@acme.it
✗ beta.it — email not found, skipping
```

### 4.3 Claude Design Prompt (Copy-Paste Ready)

Use this prompt in **Claude.ai → Projects → Design**:

```
Design a B2B lead generation dashboard web app called "LeadEngine".

STYLE: Clean SaaS app, dark sidebar + light content. 
Font: Satoshi or Geist. Accent color: teal #01696f.

SCREENS TO DESIGN:

1. DASHBOARD: 4 KPI cards (Total Leads, Qualified, Emails Sent, Reply Rate), 
   a bar chart showing leads per day, and a recent activity feed on the right.

2. LEADS TABLE: Filterable table with tabs (All/Qualified/Emailed/Replied). 
   Columns: Company, Domain, Email, Source (badge), AI Score (colored badge 1-10), 
   Status, Date, Send button. Click row opens a right-side detail panel.

3. CONFIGURE PAGE: Two-column form layout. Left: Product Info (name, description, 
   value proposition). Right: Target ICP (role, industry, location, company size, 
   pain points as removable tags).

4. RUN PIPELINE PAGE: Source selector (Google Maps / Reddit toggle), limit input, 
   dry-run toggle, big "Run Now" button, and below it a live log terminal-style 
   output with colored status icons (✓ green, ✗ red, ● blue for in-progress).

SIDEBAR NAVIGATION: Logo top-left, nav items: Dashboard, Leads, Configure, 
Run Pipeline. Bottom: stats (X leads found today).

Use a professional dark sidebar (#0f1117) with white nav text, 
and warm off-white (#f7f6f2) main content area.
Score badges: red for <5, yellow for 5-6, green for ≥7.
Source badges: blue for Google Maps, orange for Reddit.
```

---

## Phase 5 — Polish & Optional Extras

**Duration estimate:** 1–2 days when needed

### 5.1 Deduplication
- Before processing any domain, check `leads` table — skip if domain already exists
- Add `--reset` CLI flag to clear old leads and start fresh

### 5.2 Reply Tracking
- Manual: update lead status via UI to "replied"
- Semi-auto: Gmail API polling on inbox for replies from known lead emails

### 5.3 Scheduling (cron)
- Add `schedule` Python library: run pipeline every morning at 8am
- Or use cron: `0 8 * * * cd /path/to/lead-engine && python main.py --source gmaps --limit 20`

### 5.4 Export
- CSV export button in UI → download all qualified leads
- Simple `pandas.DataFrame(leads).to_csv()` endpoint

### 5.5 Email Template Library
- Store multiple email templates in config per campaign
- A/B test: randomly assign template A or B, track reply rate per template

---

## Cost Summary

| Component | Monthly Cost |
|-----------|-------------|
| Claude Agent SDK (email extraction + writing + scoring) | €0 (covered by $20 plan credit) |
| Google Maps Places API | €0 (within $200 free credit) |
| Reddit PRAW API | €0 (official free API) |
| Gmail SMTP sending | €0 (500/day free) |
| SQLite storage | €0 (local file) |
| **Total new cost** | **€0/month** |
| Your existing Claude Pro plan | $20/month (already paying) |

---

## Implementation Order

1. **Day 1:** Phase 1.1–1.5 — setup, DB, Google Maps fetch, email waterfall
2. **Day 2:** Phase 1.6–1.9 — qualifier, email writer, Gmail sender, CLI working
3. **Day 3:** Phase 2 — Reddit source added, test both sources
4. **Day 4:** Phase 3 — FastAPI backend with all endpoints
5. **Day 5:** Phase 4 — HTML/CSS/JS frontend, use Claude Design for mockup
6. **Day 6:** Phase 5.1–5.2 — deduplication, reply tracking, cron scheduling

