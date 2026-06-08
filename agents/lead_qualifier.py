import json

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

client = Anthropic()


def qualify_lead(lead: dict, config: dict) -> tuple[int, str]:
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[
            {
                "role": "user",
                "content": f"""You are a B2B sales qualifier. Score this lead 1-10 for fit.

PRODUCT: {config['product']['description']}
TARGET: {config['target']['role']} at {config['target']['industry']}
PAIN POINTS: {config['target']['pain_points']}

LEAD:
Company: {lead.get('company', 'Unknown')}
Domain: {lead.get('domain', 'Unknown')}

Respond as JSON only: {{"score": 8, "reason": "matches ICP perfectly because..."}}""",
            }
        ],
    )

    text = msg.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]

    result = json.loads(text.strip())
    return int(result["score"]), result["reason"]
