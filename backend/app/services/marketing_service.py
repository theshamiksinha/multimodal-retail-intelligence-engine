import os
import json
import requests
import base64
from mistralai import Mistral

client = None


def get_client():
    global client
    if client is None:
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY not set. Please set it in .env file.")
        client = Mistral(api_key=api_key)
    return client


def generate_marketing_caption(
    product_name: str,
    product_description: str = "",
    campaign_type: str = "social_media",
    tone: str = "engaging",
    platform: str = "instagram",
) -> dict:
    """Generate marketing caption and hashtags using Mistral."""
    c = get_client()

    platform_guidelines = {
        "instagram": "Keep it visual-first. Use emojis. Under 2200 chars. 20-30 hashtags work well.",
        "facebook": "Conversational tone. Can be longer. Include a call to action.",
        "twitter": "Under 280 characters. Punchy and concise. 2-3 hashtags max.",
    }

    campaign_context = {
        "social_media": "This is a regular social media promotional post.",
        "clearance": "This is a clearance/sale campaign. Emphasize urgency and discounts.",
        "seasonal": "This is a seasonal campaign. Connect the product to the current season.",
    }

    prompt = f"""You are a marketing content creator for a small retail store.

Product: {product_name}
Description: {product_description}
Campaign Type: {campaign_context.get(campaign_type, campaign_type)}
Tone: {tone}
Platform: {platform}
Platform Guidelines: {platform_guidelines.get(platform, "")}

Generate:
1. A compelling marketing caption for this product
2. A list of 5-10 relevant hashtags

Respond in JSON format:
{{"caption": "your caption here", "hashtags": ["#tag1", "#tag2", ...]}}
"""

    response = c.chat.complete(
        model="mistral-small-latest",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.8,
    )

    result = json.loads(response.choices[0].message.content)
    return {
        "caption": result.get("caption", ""),
        "hashtags": result.get("hashtags", []),
        "platform": platform,
    }


def generate_marketing_image(
    product_name: str,
    campaign_type: str = "social_media",
) -> str | None:
    """Generate a marketing image using Hugging Face Inference API.
    Returns a base64 data URL ready to use as an <img src=".." />."""
    hf_token = os.getenv("HUGGINGFACE_API_TOKEN")
    if not hf_token:
        raise ValueError("HUGGINGFACE_API_TOKEN not set. Please set it in .env file.")

    style_hints = {
        "social_media": "vibrant, eye-catching, modern social media ad style",
        "clearance": "bold SALE banner, red and yellow colors, urgent feel",
        "seasonal": "seasonal themed, warm and inviting colors",
    }

    image_prompt = (
        f"Professional retail marketing photo for: {product_name}. "
        f"Style: {style_hints.get(campaign_type, 'professional product advertisement')}. "
        "Clean background, studio lighting, commercial product photography, "
        "high quality, no text, no watermarks."
    )

    api_url = "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell"
    headers = {"Authorization": f"Bearer {hf_token}"}
    payload = {
        "inputs": image_prompt,
        "parameters": {
            "num_inference_steps": 4,
            "width": 1024,
            "height": 1024,
        },
    }

    response = requests.post(api_url, headers=headers, json=payload, timeout=60)

    if response.status_code == 200:
        b64 = base64.b64encode(response.content).decode("utf-8")
        return f"data:image/png;base64,{b64}"
    else:
        print(f"Image generation failed: {response.status_code} — {response.text}")
        return None


def generate_campaign_from_data(
    sales_context: str,
    campaign_goal: str = "promote top products",
) -> dict:
    """Generate a full marketing campaign suggestion based on sales data."""
    c = get_client()

    prompt = f"""You are a marketing strategist for a small retail store.

Based on the following store data, create a marketing campaign:

{sales_context}

Campaign Goal: {campaign_goal}

Provide:
1. Campaign name
2. Target products (from the data)
3. 3 social media post captions with hashtags
4. Timing recommendation
5. Key messaging strategy

Respond in JSON format:
{{
    "campaign_name": "...",
    "target_products": ["..."],
    "posts": [
        {{"caption": "...", "hashtags": ["..."], "platform": "instagram"}},
        ...
    ],
    "timing": "...",
    "strategy": "..."
}}
"""

    response = c.chat.complete(
        model="mistral-small-latest",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.8,
    )


    return json.loads(response.choices[0].message.content)
