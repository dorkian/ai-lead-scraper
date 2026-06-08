import json

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

client = Anthropic()


def write_cold_email(lead: dict, config: dict, signature: dict = None) -> tuple[str, str]:
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[
            {
                "role": "user",
                "content": f"""Write a cold outreach email. Rules:
- Max 3 short paragraphs
- Personal opener referencing their business specifically
- One clear value prop sentence
- Soft CTA (15-min call, not a demo)
- No buzzwords, no pushy language
- Sign as {config['outreach']['sender_name']}

SENDER PRODUCT: {config['product']['name']} — {config['product']['value_prop']}
RECIPIENT: {lead.get('name') or 'there'} at {lead.get('company', 'your company')} ({lead.get('domain', '')})

Return JSON only: {{"subject": "...", "body": "..."}}""",
            }
        ],
    )

    text = msg.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]

    result = json.loads(text.strip())
    subject = result["subject"]
    body = result["body"]

    if signature:
        name = signature.get("name", "")
        title = signature.get("title", "")
        company = signature.get("company", "")
        website = signature.get("website", "")
        phone = signature.get("phone", "")

        title_company_parts = [p for p in [title, company] if p]
        title_company_line = " | ".join(title_company_parts)

        website_phone_parts = [p for p in [website, phone] if p]
        website_phone_line = " | ".join(website_phone_parts)

        sig_lines = ["", "", "--"]
        if name:
            sig_lines.append(name)
        if title_company_line:
            sig_lines.append(title_company_line)
        if website_phone_line:
            sig_lines.append(website_phone_line)

        body = body + "\n".join(sig_lines)

    return subject, body
