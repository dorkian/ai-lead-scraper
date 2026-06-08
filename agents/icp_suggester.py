import json

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

client = Anthropic()


def suggest_icp(product_name: str, description: str, value_prop: str) -> dict:
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        messages=[{
            "role": "user",
            "content": (
                "Based on this product, suggest the ideal B2B customer profile (ICP).\n\n"
                f"Product name: {product_name}\n"
                f"Description: {description}\n"
                f"Value proposition: {value_prop}\n\n"
                "Return JSON only — no commentary:\n"
                "{\n"
                '  "role": "primary buyer title",\n'
                '  "industry": "best target industry",\n'
                '  "location": "target geography",\n'
                '  "company_size": "ideal size range",\n'
                '  "pain_points": ["pain 1", "pain 2", "pain 3"]\n'
                "}"
            ),
        }],
    )
    text = msg.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())
