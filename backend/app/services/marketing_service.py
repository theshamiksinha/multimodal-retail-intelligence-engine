import os
import json
import uuid
import requests
import base64
import time
from datetime import datetime
from mistralai import Mistral
import static_ffmpeg
static_ffmpeg.add_paths()

_DATA_DIR    = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data")
_ARCHIVE_FILE = os.path.join(_DATA_DIR, "ad_archive.json")


def _load_archive() -> list:
    try:
        with open(_ARCHIVE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save_archive(ads: list):
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(_ARCHIVE_FILE, "w") as f:
        json.dump(ads, f, indent=2)

client = None


def get_client():
    global client
    if client is None:
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY not set. Please set it in .env file.")
        client = Mistral(api_key=api_key)
    return client


def strip_formatting(text: str) -> str:
    """Remove markdown bold/italic formatting characters from text."""
    import re
    if not text:
        return text
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'__(.*?)__', r'\1', text)
    text = re.sub(r'\*(.*?)\*', r'\1', text)
    text = re.sub(r'_(.*?)_', r'\1', text)
    return text


def generate_marketing_caption(
    product_name: str,
    product_description: str = "",
    campaign_type: str = "social_media",
    tone: str = "engaging",
    platform: str = "instagram",
    post_type: str = "post",
) -> dict:
    """Generate marketing caption and hashtags using Mistral."""
    c = get_client()

    platform_guidelines = {
        "instagram": "Keep it visual-first. Use emojis. Under 2200 chars. 20-30 hashtags work well.",
        "twitter": "Under 280 characters total including hashtags. Punchy and concise. 2-3 hashtags max.",
    }

    campaign_context = {
        "social_media": "This is a regular social media promotional post.",
        "clearance": "This is a special offer / clearance campaign. Highlight value for money and great deals. Do NOT mention expiry dates, days remaining, stock counts, or any inventory details — just make it sound like an unmissable offer.",
        "seasonal": "This is a seasonal campaign. Connect the product to the current season.",
    }

    post_type_context = {
        "post": "This is a standard feed post with image.",
        "story": "This is an Instagram Story. Keep it very short and punchy (stories are 24h only).",
        "reel": "This is an Instagram Reel (short video). Write an engaging caption that works with video content.",
    }

    prompt = f"""You are a marketing content creator for a small retail store.

Product: {product_name}
Description: {product_description}
Campaign Type: {campaign_context.get(campaign_type, campaign_type)}
Tone: {tone}
Platform: {platform}
Post Type: {post_type_context.get(post_type, post_type)}
Platform Guidelines: {platform_guidelines.get(platform, "")}

IMPORTANT: Do NOT use any markdown formatting in your caption. No asterisks, no underscores, no bold, no italics. Plain text only.

Generate:
1. A compelling marketing caption for this product (plain text, no markdown formatting characters)
2. A list of 5-10 relevant hashtags (fewer for Twitter)

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
    caption = strip_formatting(result.get("caption", ""))
    return {
        "caption": caption,
        "hashtags": result.get("hashtags", []),
        "platform": platform,
    }


def generate_voiceover_line(
    product_name: str,
    product_description: str = "",
    campaign_type: str = "social_media",
    tone: str = "engaging",
) -> str:
    """Generate a short (≤15 words) voiceover line using Mistral."""
    c = get_client()

    tone_hints = {
        "engaging": "enthusiastic and inviting",
        "urgent": "urgent and exciting",
        "casual": "friendly and relaxed",
        "professional": "confident and polished",
    }

    campaign_hints = {
        "social_media": "promotional",
        "clearance": "special offer, great deal, value-focused — no mention of expiry or stock counts",
        "seasonal": "seasonal and timely",
    }

    prompt = f"""Write ONE short voiceover line for a 5-second Instagram Reel ad.

Product: {product_name}
{f"Description: {product_description}" if product_description else ""}
Tone: {tone_hints.get(tone, tone)}
Campaign: {campaign_hints.get(campaign_type, campaign_type)}

Rules:
- Maximum 15 words — it must fit in 5 seconds of speech
- No hashtags, no emojis, no punctuation except a period or exclamation mark at the end
- Sound natural when spoken aloud
- Be catchy and memorable

Respond with ONLY the voiceover line, nothing else."""

    response = c.chat.complete(
        model="mistral-small-latest",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.9,
    )

    line = response.choices[0].message.content.strip().strip('"').strip("'")
    return strip_formatting(line)


def generate_elevenlabs_audio(voiceover_text: str) -> bytes:
    """Convert text to speech using ElevenLabs API. Returns raw MP3 bytes."""
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise ValueError("ELEVENLABS_API_KEY not set. Please set it in .env file.")

    # Use Rachel (21m00Tcm4TlvDq8ikWAM) — clear, warm, commercial voice
    # You can change this to any ElevenLabs voice ID
    voice_id = "cgSgspJ2msm6clMCkdW9"

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": voiceover_text,
        "model_id": "eleven_turbo_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.8,
            "style": 0.3,
            "use_speaker_boost": True,
        },
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    if not resp.ok:
        raise ValueError(f"ElevenLabs TTS failed ({resp.status_code}): {resp.text[:300]}")

    return resp.content  # raw MP3 bytes


def generate_marketing_image(
    product_name: str,
    campaign_type: str = "social_media",
    post_type: str = "post",
) -> str | None:
    hf_token = os.getenv("HUGGINGFACE_API_TOKEN")
    if not hf_token:
        raise ValueError("HUGGINGFACE_API_TOKEN not set.")

    style_hints = {
        "social_media": "vibrant, eye-catching, modern social media ad style",
        "clearance": "bold SALE banner, red and yellow colors, urgent feel",
        "seasonal": "seasonal themed, warm and inviting colors",
    }

    if post_type == "story":
        width, height = 1080, 1920
    elif post_type == "reel":
        width, height = 1080, 1920
    else:
        width, height = 1080, 1350

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
            "width": width,
            "height": height,
        },
    }

    response = requests.post(api_url, headers=headers, json=payload, timeout=60)
    if response.status_code != 200:
        print(f"Image generation failed: {response.status_code} — {response.text}")
        return None

    from PIL import Image
    import io, base64

    img = Image.open(io.BytesIO(response.content)).convert("RGB")
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=92)

    b64 = base64.b64encode(out.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def generate_reel_video(
    product_name: str,
    product_description: str = "",
    campaign_type: str = "social_media",
) -> str:
    replicate_token = os.getenv("REPLICATE_API_TOKEN")
    if not replicate_token:
        raise ValueError("REPLICATE_API_TOKEN not set. Please set it in .env file.")

    style_hints = {
        "social_media": "vibrant product showcase, dynamic camera movement, modern ad aesthetics",
        "clearance": "bold sale advertisement, urgent energy, red and gold accents",
        "seasonal": "seasonal atmosphere, warm lighting, lifestyle feel",
    }

    video_prompt = (
        f"Professional Instagram Reel advertisement for: {product_name}. "
        f"{product_description + '. ' if product_description else ''}"
        f"Style: {style_hints.get(campaign_type, 'professional product ad')}. "
        "9:16 vertical format, cinematic quality, 5 seconds, no text overlays, "
        "commercial product video, smooth motion."
    )

    headers = {
        "Authorization": f"Bearer {replicate_token}",
        "Content-Type": "application/json",
    }

    create_resp = requests.post(
        "https://api.replicate.com/v1/models/minimax/video-01/predictions",
        headers=headers,
        json={
            "input": {
                "prompt": video_prompt,
                "aspect_ratio": "9:16",
                "duration": 5,
                "prompt_optimizer": True,
            }
        },
        timeout=30,
    )

    if not create_resp.ok:
        raise ValueError(
            f"Replicate create failed: {create_resp.status_code} — {create_resp.text}"
        )

    prediction = create_resp.json()
    poll_url = prediction.get("urls", {}).get("get")
    if not poll_url:
        raise ValueError(f"Replicate returned no poll URL: {prediction}")

    web_url = prediction.get("urls", {}).get("web")
    if web_url:
        print("Replicate prediction page:", web_url)

    for _ in range(60):
        time.sleep(5)

        poll_resp = requests.get(poll_url, headers=headers, timeout=15)
        if not poll_resp.ok:
            raise ValueError(
                f"Replicate poll failed: {poll_resp.status_code} — {poll_resp.text}"
            )

        data = poll_resp.json()
        status = data.get("status")
        output = data.get("output")

        print("Replicate status:", status)

        if output:
            if isinstance(output, list) and output:
                return output[0]
            if isinstance(output, str):
                return output

        if status in ("succeeded", "successful"):
            raise ValueError(f"Prediction finished but no output was returned: {data}")

        if status in ("failed", "canceled"):
            raise ValueError(f"Replicate prediction failed: {data.get('error') or data}")

    raise ValueError("Replicate video generation timed out after polling.")


def add_music_to_reel(
    video_url: str,
    genre: str = "upbeat",
    product_name: str = "",
    product_description: str = "",
    campaign_type: str = "social_media",
    tone: str = "engaging",
    voiceover_text: str = "",
) -> str | None:
    """
    Download the reel video, generate a TTS voiceover via ElevenLabs,
    fetch a royalty-free music track from Jamendo, then mix all three together:
      - Video  (original, no audio assumed)
      - Music  (background, ~35% volume)
      - TTS voiceover  (~85% volume, centred in the clip)

    Returns the Cloudinary URL of the mixed video.
    """
    import tempfile
    import subprocess
    import os

    jamendo_client_id = "3bca7f8a"

    genre_queries = {
        "pop": "pop upbeat instrumental background",
        "hip_hop": "hip hop instrumental beat",
        "electronic": "electronic edm instrumental background",
        "acoustic": "acoustic guitar instrumental",
        "cinematic": "cinematic dramatic instrumental",
        "upbeat": "upbeat happy instrumental",
        "lofi": "lofi chill instrumental",
        "jazz": "jazz instrumental background",
    }
    query = genre_queries.get(genre, f"{genre} instrumental background")

    # ── 1. Fetch music from Jamendo ───────────────────────────────────────
    search_resp = requests.get(
        "https://api.jamendo.com/v3.0/tracks/",
        params={
            "client_id": jamendo_client_id,
            "format": "json",
            "limit": 10,
            "search": query,
            "audioformat": "mp32",
            "order": "popularity_total",
        },
        timeout=20,
    )

    if not search_resp.ok:
        raise ValueError(f"Jamendo search failed: {search_resp.text}")

    results = search_resp.json().get("results", [])
    if not results:
        raise ValueError(f"No music found for genre '{genre}' on Jamendo.")

    music_url = None
    for track in results:
        candidate = track.get("audiodownload") or track.get("audio")
        if candidate:
            music_url = candidate
            break

    if not music_url:
        raise ValueError("Could not find a downloadable music URL on Jamendo.")

    # ── 2. Generate voiceover via ElevenLabs ─────────────────────────────
    if not voiceover_text:
        voiceover_text = generate_voiceover_line(
            product_name=product_name,
            product_description=product_description,
            campaign_type=campaign_type,
            tone=tone,
        )
    print(f"Voiceover line: {voiceover_text!r}")

    tts_audio_bytes = generate_elevenlabs_audio(voiceover_text)

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path  = os.path.join(tmpdir, "input_video.mp4")
        music_path  = os.path.join(tmpdir, "music.mp3")
        tts_path    = os.path.join(tmpdir, "voiceover.mp3")
        output_path = os.path.join(tmpdir, "output_with_music.mp4")

        # ── Download video ────────────────────────────────────────────────
        video_resp = requests.get(video_url, timeout=120, stream=True)
        if not video_resp.ok:
            raise ValueError(f"Failed to download video: {video_resp.status_code}")
        with open(video_path, "wb") as f:
            for chunk in video_resp.iter_content(chunk_size=8192):
                f.write(chunk)

        # ── Download music ────────────────────────────────────────────────
        music_resp = requests.get(music_url, timeout=30, stream=True)
        if not music_resp.ok:
            raise ValueError(f"Failed to download music: {music_resp.status_code}")
        with open(music_path, "wb") as f:
            for chunk in music_resp.iter_content(chunk_size=8192):
                f.write(chunk)

        # ── Save TTS audio ────────────────────────────────────────────────
        with open(tts_path, "wb") as f:
            f.write(tts_audio_bytes)

        # ── Get video duration for voiceover delay ────────────────────────
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", video_path],
            capture_output=True, text=True, timeout=15,
        )
        try:
            video_duration = float(probe.stdout.strip())
        except Exception:
            video_duration = 5.0

        # ── Mix: music (bg) + TTS voiceover centred in the clip ──────────
        # adelay centres the voiceover: delay = (video_duration - tts_duration) / 2 * 1000 ms
        # We approximate TTS duration as 2.5 s for a ~12-word phrase.
        # ffprobe on tts_path gives the real duration:
        tts_probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", tts_path],
            capture_output=True, text=True, timeout=15,
        )
        try:
            tts_duration = float(tts_probe.stdout.strip())
        except Exception:
            tts_duration = 2.5

        delay_ms = max(0, int((video_duration - tts_duration) / 2 * 1000))

        # Filter graph:
        #   [1:a] music looped → volume 0.35 → trim to video length
        #   [2:a] TTS → volume 0.85 → pad with silence (adelay centres it)
        #   amix both → final audio
        # Trim everything to the exact video duration
               # Filter graph
        filter_complex = (
            f"[1:a]volume=0.25,atrim=duration={video_duration},asetpts=N/SR/TB[bg];"
            f"[2:a]volume=1.0,adelay={delay_ms}|{delay_ms},atrim=duration={video_duration},asetpts=N/SR/TB[vo];"
            f"[bg][vo]amix=inputs=2:duration=first:dropout_transition=0[aout]"
        )

        ffmpeg_cmd = [
            "ffmpeg", "-y", "-nostdin",
            "-loglevel", "error",
            "-i", video_path,
            "-stream_loop", "-1", "-i", music_path,
            "-i", tts_path,
            "-filter_complex", filter_complex,
            "-map", "0:v:0",
            "-map", "[aout]",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            "-movflags", "+faststart",
            output_path,
        ]

        try:
            result = subprocess.run(
                ffmpeg_cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                timeout=180,   # was 60
            )
        except FileNotFoundError:
            raise ValueError("ffmpeg is not installed on the server.")
        except subprocess.TimeoutExpired as e:
            raise ValueError(
                f"ffmpeg music mixing timed out after 180s. "
                f"stderr: {(e.stderr or '')[-500:]}"
            )

        if result.returncode != 0:
            raise ValueError(
                f"ffmpeg failed: {(result.stderr or 'unknown error')[-500:]}"
            )
        
        # ── Upload mixed video to Cloudinary ──────────────────────────────
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
            api_key=os.getenv("CLOUDINARY_API_KEY"),
            api_secret=os.getenv("CLOUDINARY_API_SECRET"),
            secure=True,
        )

        upload_resp = cloudinary.uploader.upload(
            output_path,
            resource_type="video",
        )
        return upload_resp["secure_url"]


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

IMPORTANT: Do NOT use markdown formatting in captions. Plain text only, no asterisks or underscores.

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

    result = json.loads(response.choices[0].message.content)

    if "posts" in result:
        for post in result["posts"]:
            if "caption" in post:
                post["caption"] = strip_formatting(post["caption"])

    return result

def get_top_products_list(sales_context: str, limit: int = 20) -> list:
    """
    Extract a ranked list of top products from the sales context string.
    Uses Mistral to parse whatever format the sales_service returns.
    Returns a list of dicts: [{name, description, rank}, ...]
    """
    c = get_client()

    prompt = f"""You are a data analyst. From the following store sales data, extract the top {limit} best-selling or most relevant products.

{sales_context}

Return ONLY a JSON array (no wrapper object) of up to {limit} products, ordered best-first:
[
  {{"name": "Product Name", "description": "Short 1-sentence description or empty string", "rank": 1}},
  ...
]

Rules:
- Use the exact product names as they appear in the data
- If descriptions are not in the data, use an empty string
- Return at most {limit} items
- No markdown, no extra fields
"""

    response = c.chat.complete(
        model="mistral-small-latest",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.2,
    )

    raw = response.choices[0].message.content.strip()
    # The model may return {"products": [...]} or a bare array — handle both
    parsed = json.loads(raw)
    if isinstance(parsed, list):
        return parsed
    # Try common wrapper keys
    for key in ("products", "items", "data", "result"):
        if key in parsed and isinstance(parsed[key], list):
            return parsed[key]
    # Fallback: return first list value found
    for v in parsed.values():
        if isinstance(v, list):
            return v
    return []


def extract_products_from_advisor_text(text: str) -> list[dict]:
    """Use Mistral to pull product names out of an AI advisor response."""
    c = get_client()
    prompt = f"""The following is a retail advisor's response recommending products for marketing campaigns.
Extract every distinct product name mentioned. Return ONLY a JSON array of objects, nothing else.

Text:
{text}

Return format (JSON array, no wrapper):
[{{"name": "Exact Product Name", "campaign_type": "social_media|clearance|seasonal"}}]

Rules:
- Use exact product names as written
- If the context implies clearance/sale/expiry: campaign_type = "clearance"
- If seasonal context: campaign_type = "seasonal"
- Otherwise: campaign_type = "social_media"
- Return empty array [] if no products found
"""
    try:
        response = c.chat.complete(
            model="mistral-small-latest",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        raw = response.choices[0].message.content.strip()
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        for key in ("products", "items", "data", "result"):
            if key in parsed and isinstance(parsed[key], list):
                return parsed[key]
        for v in parsed.values():
            if isinstance(v, list):
                return v
    except Exception:
        pass
    return []


def generate_ad_drafts_from_text(advisor_text: str, tone: str = "engaging", platform: str = "instagram") -> list[dict]:
    """Extract products from advisor response and generate caption drafts. Saves to archive."""
    products = extract_products_from_advisor_text(advisor_text)
    if not products:
        return []

    ads = []
    archive = _load_archive()

    for p in products[:8]:  # cap at 8 to avoid runaway API calls
        name = p.get("name", "").strip()
        campaign_type = p.get("campaign_type", "social_media")
        if not name:
            continue
        try:
            result = generate_marketing_caption(
                product_name=name,
                product_description="",
                campaign_type=campaign_type,
                tone=tone,
                platform=platform,
                post_type="post",
            )
            ad = {
                "id": str(uuid.uuid4()),
                "created_at": datetime.utcnow().isoformat(),
                "source": "ai_advisor",
                "product_name": name,
                "campaign_type": campaign_type,
                "tone": tone,
                "platform": platform,
                "caption": result.get("caption", ""),
                "hashtags": result.get("hashtags", []),
                "image_url": None,
                "status": "draft",
            }
            ads.append(ad)
            archive.append(ad)
        except Exception:
            continue

    _save_archive(archive)
    return ads


def get_ad_archive() -> list[dict]:
    return _load_archive()


def delete_ad_from_archive(ad_id: str) -> bool:
    archive = _load_archive()
    new_archive = [a for a in archive if a["id"] != ad_id]
    if len(new_archive) == len(archive):
        return False
    _save_archive(new_archive)
    return True