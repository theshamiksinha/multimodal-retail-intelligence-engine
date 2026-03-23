import os
from openai import OpenAI

client = None


def get_client():
    global client
    if client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set. Please set it in .env file.")
        client = OpenAI(api_key=api_key)
    return client


def generate_marketing_caption(
    product_name: str,
    product_description: str = "",
    campaign_type: str = "social_media",
    tone: str = "engaging",
    platform: str = "instagram",
) -> dict:
    """Generate marketing caption and hashtags using GPT."""
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

    response = c.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.8,
    )

    import json
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
    """Generate a marketing image using DALL-E."""
    c = get_client()

    style_hints = {
        "social_media": "vibrant, eye-catching, modern social media ad style",
        "clearance": "bold SALE banner, red and yellow colors, urgent feel",
        "seasonal": "seasonal themed, warm and inviting colors",
    }

    prompt = f"""Create a professional retail marketing image for: {product_name}.
Style: {style_hints.get(campaign_type, "professional product advertisement")}.
The image should be clean, professional, and suitable for a small retail store's social media.
No text in the image."""

    try:
        response = c.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="standard",
            n=1,
        )
        return response.data[0].url
    except Exception as e:
        print(f"Image generation failed: {e}")
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

    response = c.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.8,
    )

    import json
    return json.loads(response.choices[0].message.content)
