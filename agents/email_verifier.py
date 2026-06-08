import smtplib

import dns.resolver


def verify_email(email: str) -> bool:
    try:
        domain = email.split("@")[1]
        mx_records = dns.resolver.resolve(domain, "MX")
        mx_host = str(mx_records[0].exchange).rstrip(".")
        with smtplib.SMTP(mx_host, 25, timeout=10) as smtp:
            smtp.helo("verifier.local")
            smtp.mail("verify@verifier.local")
            code, _ = smtp.rcpt(email)
            return code == 250
    except Exception:
        return False
