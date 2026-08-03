from __future__ import annotations

import json

import requests


BASE = "http://127.0.0.1:8000"


def show(title: str, response: requests.Response) -> None:
    print()
    print(title)
    print("=" * len(title))
    print("Status:", response.status_code)
    try:
        print(json.dumps(response.json(), indent=2))
    except ValueError:
        print(response.text)


def main() -> None:
    show(
        "Health",
        requests.get(
            f"{BASE}/health",
            timeout=30,
        ),
    )

    show(
        "Current URL detector",
        requests.post(
            f"{BASE}/analyze-url",
            json={
                "url":
                    "https://www.example.com/"
            },
            timeout=30,
        ),
    )

    show(
        "Email detector",
        requests.post(
            f"{BASE}/analyze-email",
            json={
                "provider":
                    "gmail",
                "sender":
                    "Example Sender",
                "subject":
                    "Class schedule update",
                "body":
                    "The class schedule has been updated."
            },
            timeout=60,
        ),
    )


if __name__ == "__main__":
    main()
