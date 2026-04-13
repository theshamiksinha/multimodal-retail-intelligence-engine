import os
import json
import base64
import datetime
import requests as http_requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.models.schemas import MarketingRequest
from app.services import marketing_service, sales_service
from PIL import Image, ImageDraw, ImageFont
import io
import textwrap

router = APIRouter()

# Prefer env vars for channel IDs. The hard-coded values are kept only as fallbacks.
INSTAGRAM_CHANNEL_ID = os.getenv("BUFFER_INSTAGRAM_CHANNEL_ID", "69dc2875031bfa423cf91831")
TWITTER_CHANNEL_ID = os.getenv("BUFFER_TWITTER_CHANNEL_ID", "69dc36c6031bfa423cf946c1")

# Official Buffer GraphQL endpoint.
BUFFER_GQL_URL = "https://api.buffer.com"


# ─── /generate ───────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_marketing_content(request: MarketingRequest):
    try:
        post_type = getattr(request, "post_type", "post")
        result = marketing_service.generate_marketing_caption(
            product_name=request.product_name,
            product_description=request.product_description,
            campaign_type=request.campaign_type,
            tone=request.tone,
            platform=request.platform,
            post_type=post_type,
        )
        image_url = None
        if request.generate_image and post_type != "reel":
            image_url = marketing_service.generate_marketing_image(
                product_name=request.product_name,
                campaign_type=request.campaign_type,
                post_type=post_type,
            )
        return {
            "caption": result["caption"],
            "hashtags": result["hashtags"],
            "image_url": image_url,
            "platform": result["platform"],
            "post_type": post_type,
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Marketing generation failed: {str(e)}")


# ─── /generate-reel-video ────────────────────────────────────────────────────

class ReelVideoRequest(BaseModel):
    product_name: str
    product_description: str = ""
    campaign_type: str = "social_media"


@router.post("/generate-reel-video")
async def generate_reel_video_endpoint(request: ReelVideoRequest):
    try:
        video_url = marketing_service.generate_reel_video(
            product_name=request.product_name,
            product_description=request.product_description,
            campaign_type=request.campaign_type,
        )
        return {"video_url": video_url}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Reel video generation failed: {str(e)}")


# ─── /generate-voiceover-line ────────────────────────────────────────────────

class VoiceoverLineRequest(BaseModel):
    product_name: str
    product_description: str = ""
    campaign_type: str = "social_media"
    tone: str = "engaging"


@router.post("/generate-voiceover-line")
async def generate_voiceover_line_endpoint(request: VoiceoverLineRequest):
    try:
        line = marketing_service.generate_voiceover_line(
            product_name=request.product_name,
            product_description=request.product_description,
            campaign_type=request.campaign_type,
            tone=request.tone,
        )
        return {"voiceover_text": line}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Voiceover line generation failed: {str(e)}")


# ─── /add-music-to-reel ──────────────────────────────────────────────────────

class AddMusicRequest(BaseModel):
    video_url: str
    genre: str = "upbeat"
    product_name: str = ""
    product_description: str = ""
    campaign_type: str = "social_media"
    tone: str = "engaging"
    voiceover_text: str = ""


@router.post("/add-music-to-reel")
async def add_music_to_reel_endpoint(request: AddMusicRequest):
    try:
        mixed_url = marketing_service.add_music_to_reel(
            video_url=request.video_url,
            genre=request.genre,
            product_name=request.product_name,
            product_description=request.product_description,
            campaign_type=request.campaign_type,
            tone=request.tone,
            voiceover_text=request.voiceover_text,
        )
        if not mixed_url:
            raise HTTPException(500, "Music mixing returned no URL.")
        return {"video_url": mixed_url}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Music mixing failed: {str(e)}")


# ─── /campaign ───────────────────────────────────────────────────────────────

@router.post("/campaign")
async def generate_campaign(goal: str = "promote top products"):
    try:
        sales_context = sales_service.get_context_for_advisor()
        result = marketing_service.generate_campaign_from_data(sales_context, goal)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Campaign generation failed: {str(e)}")


# ─── /top-products ───────────────────────────────────────────────────────────

@router.get("/top-products")
async def get_top_products(limit: int = 20):
    """Return top products from sales data for auto-campaign planning."""
    try:
        sales_context = sales_service.get_context_for_advisor()
        products = marketing_service.get_top_products_list(sales_context, limit=limit)
        return {"products": products}
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch top products: {str(e)}")


# ─── /expiring-products ──────────────────────────────────────────────────────

@router.get("/expiring-products")
async def get_expiring_products(limit: int = 30):
    """Return inventory products scored by clearance urgency for auto-campaign planning.

    Urgency score = (unit_price * current_stock) / max(days_to_expiry, 1)
    — high value at risk + imminent expiry = post it first.
    Products with no expiry date are included last (scored by stock value only).
    """
    inventory = sales_service.get_inventory_status()
    if not inventory:
        return {"products": []}

    items = inventory.get("all_items", [])
    scored = []
    for item in items:
        price = item.get("unit_price") or 0
        stock = item.get("current_stock") or 0
        days  = item.get("days_to_expiry")
        value = price * stock
        if days is not None:
            urgency = value / max(days, 1)
            has_expiry = True
        else:
            urgency = value / 1000  # low priority compared to expiring items
            has_expiry = False
        scored.append({
            "name": item.get("product_name", ""),
            "description": (
                f"{stock} units in stock"
                + (f", expires in {days} day{'s' if days != 1 else ''}" if has_expiry else "")
                + f" — value at risk: ${value:.0f}"
            ),
            "days_to_expiry": days,
            "current_stock": stock,
            "unit_price": price,
            "urgency_score": round(urgency, 2),
            "has_expiry": has_expiry,
        })

    scored.sort(key=lambda x: x["urgency_score"], reverse=True)
    return {"products": scored[:limit]}


# ─── /auto-campaign ──────────────────────────────────────────────────────────

class AutoCampaignDayRequest(BaseModel):
    product_name: str
    product_description: str = ""
    campaign_type: str = "social_media"
    tone: str = "engaging"
    platform: str = "instagram"
    post_type: str = "post"
    scheduled_at: str   # ISO 8601 UTC


class AutoCampaignRequest(BaseModel):
    days: List[AutoCampaignDayRequest]


@router.post("/auto-campaign")
async def run_auto_campaign(request: AutoCampaignRequest):
    """
    For each day, generate caption + image/video then schedule to Buffer.
    Returns one result object per day.
    """
    api_key = os.getenv("BUFFER_ACCESS_TOKEN")
    if not api_key:
        raise HTTPException(400, "BUFFER_ACCESS_TOKEN not set in .env")

    results = []
    for day in request.days:
        try:
            caption_result = marketing_service.generate_marketing_caption(
                product_name=day.product_name,
                product_description=day.product_description,
                campaign_type=day.campaign_type,
                tone=day.tone,
                platform=day.platform,
                post_type=day.post_type,
            )

            image_data_url = None
            video_url = None
            if day.post_type == "reel":
                video_url = marketing_service.generate_reel_video(
                    product_name=day.product_name,
                    product_description=day.product_description,
                    campaign_type=day.campaign_type,
                )
            else:
                try:
                    image_data_url = marketing_service.generate_marketing_image(
                        product_name=day.product_name,
                        campaign_type=day.campaign_type,
                        post_type=day.post_type,
                    )
                except Exception as img_err:
                    print(f"Image gen failed for {day.product_name}: {img_err}")

            caption_text = caption_result["caption"]
            hashtags = caption_result["hashtags"]
            full_caption = caption_text + (
                "\n\n" + " ".join(hashtags)
                if day.platform == "instagram" and day.post_type != "story"
                else ""
            )

            buf_req = _BufferPostInternal(
                platform=day.platform,
                post_type=day.post_type,
                caption=full_caption,
                hashtags=hashtags,
                image_data_url=image_data_url,
                video_url=video_url,
                scheduled_at=day.scheduled_at,
            )
            post_result = await _post_to_buffer_core(buf_req, api_key)

            results.append({
                "status": "ok",
                "scheduled_at": day.scheduled_at,
                "product_name": day.product_name,
                "platform": day.platform,
                "post_type": day.post_type,
                "campaign_type": day.campaign_type,
                "caption": caption_text,
                "hashtags": hashtags,
                "image_url": image_data_url,
                "video_url": video_url,
                "buffer_post_id": post_result.get("id"),
                "buffer_due_at": post_result.get("dueAt"),
            })

        except Exception as e:
            results.append({
                "status": "error",
                "scheduled_at": day.scheduled_at,
                "product_name": day.product_name,
                "error": str(e),
            })

    return {"results": results}


# ─── ImgBB upload ─────────────────────────────────────────────────────────────

def upload_image_to_imgbb(image_data_url: str) -> str:
    imgbb_api_key = os.getenv("IMGBB_API_KEY")
    if not imgbb_api_key:
        raise ValueError("IMGBB_API_KEY not set in .env.")

    base64_data = image_data_url.split(",")[1] if "," in image_data_url else image_data_url

    resp = http_requests.post(
        "https://api.imgbb.com/1/upload",
        data={"key": imgbb_api_key, "image": base64_data},
        timeout=30,
    )
    if not resp.ok:
        raise ValueError(f"ImgBB upload failed ({resp.status_code}): {resp.text[:300]}")

    data = resp.json().get("data", {})
    # Prefer display_url (direct image), fall back to url
    url = data.get("display_url") or data.get("url")
    if not url:
        raise ValueError(f"ImgBB returned no URL: {resp.text[:300]}")
    # Ensure https
    if not url.startswith("https"):
        url = "https://" + url.lstrip("http://")
    
    # Verify the URL is actually accessible before returning it
    try:
        check = http_requests.head(url, timeout=10, allow_redirects=True)
        if not check.ok:
            # Fall back to the direct URL variant
            alt_url = data.get("url") or data.get("display_url")
            if alt_url and alt_url != url:
                return alt_url if alt_url.startswith("https") else "https://" + alt_url.lstrip("http://")
    except Exception:
        pass
    
    return url


# ─── Story caption overlay ────────────────────────────────────────────────────

def overlay_caption_on_story_image(image_data_url: str, caption: str) -> str:
    try:
        b64data = image_data_url.split(",", 1)[1] if "," in image_data_url else image_data_url
        img = Image.open(io.BytesIO(base64.b64decode(b64data))).convert("RGBA")
        w, h = img.size

        target_ratio = 9 / 16
        current_ratio = w / h
        if abs(current_ratio - target_ratio) > 0.04:
            if current_ratio > target_ratio:
                new_w = int(h * target_ratio)
                img = img.crop(((w - new_w) // 2, 0, (w - new_w) // 2 + new_w, h))
            else:
                new_h = int(w / target_ratio)
                img = img.crop((0, (h - new_h) // 2, w, (h - new_h) // 2 + new_h))
            w, h = img.size

        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)
        bar_h = int(h * 0.50)
        for y in range(h - bar_h, h):
            progress = (y - (h - bar_h)) / bar_h
            alpha = int(230 * (progress ** 0.65))
            odraw.rectangle([(0, y), (w, y)], fill=(0, 0, 0, alpha))
        img = Image.alpha_composite(img, overlay)
        draw = ImageDraw.Draw(img)

        font_size = max(60, w // 9)
        font = None
        for fp in [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]:
            try:
                font = ImageFont.truetype(fp, font_size)
                break
            except Exception:
                continue
        if font is None:
            font = ImageFont.load_default()

        left_pad = int(w * 0.06)
        right_pad = int(w * 0.06)
        bottom_pad = int(h * 0.08)
        chars_line = max(8, int((w - left_pad - right_pad) / (font_size * 0.52)))

        lines = []
        for raw in caption[:250].split('\n'):
            if raw.strip():
                lines.extend(textwrap.wrap(raw, width=chars_line) or [raw])
        lines = lines[:6]

        line_h = int(font_size * 1.4)
        y_start = h - len(lines) * line_h - bottom_pad
        for i, line in enumerate(lines):
            y = y_start + i * line_h
            for dx, dy in [(-2, -2), (2, -2), (-2, 2), (2, 2), (0, 3), (3, 0)]:
                draw.text((left_pad + dx, y + dy), line, font=font, fill=(0, 0, 0, 200))
            draw.text((left_pad, y), line, font=font, fill=(255, 255, 255, 255))

        out = io.BytesIO()
        img.convert("RGB").save(out, format="JPEG", quality=92)
        return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode()}"

    except Exception as e:
        print(f"Caption overlay failed: {e}")
        return image_data_url


# ─── Image normalization ──────────────────────────────────────────────────────

def normalize_image_for_buffer(image_data_url: str, post_type: str) -> str:
    """
    Convert to RGB JPEG and normalize aspect ratio to Instagram-safe shapes.
    Instagram Feed: 1:1 square (1080x1080) is safest for API posting.
    Instagram Story: 9:16 (1080x1920).
    Square is more permissive than portrait for API-based posting.
    """
    try:
        b64data = image_data_url.split(",", 1)[1] if "," in image_data_url else image_data_url
        img = Image.open(io.BytesIO(base64.b64decode(b64data))).convert("RGB")

        if post_type == "story":
            # 9:16 for stories
            target_size = (1080, 1920)
        else:
            # Use square (1:1) for feed posts - most compatible with Instagram API
            # Portrait (4:5) can cause issues with some API integrations
            target_size = (1080, 1080)

        # Resize maintaining aspect ratio, then center on canvas
        img.thumbnail(target_size, Image.LANCZOS)
        canvas = Image.new("RGB", target_size, (255, 255, 255))
        x = (target_size[0] - img.size[0]) // 2
        y = (target_size[1] - img.size[1]) // 2
        canvas.paste(img, (x, y))

        out = io.BytesIO()
        canvas.save(out, format="JPEG", quality=90, optimize=True)
        
        # Check file size - Instagram has a 8MB limit
        size_bytes = out.tell()
        if size_bytes > 7 * 1024 * 1024:  # > 7MB, compress more
            out = io.BytesIO()
            canvas.save(out, format="JPEG", quality=75, optimize=True)
        
        return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode()}"
    except Exception as e:
        print(f"Image normalization failed: {e}")
        return image_data_url


# ─── Buffer helpers ───────────────────────────────────────────────────────────

def _resolve_channel_id(platform: str) -> str:
    platform = (platform or "").lower()
    if platform == "instagram":
        if not INSTAGRAM_CHANNEL_ID:
            raise ValueError("Instagram channel ID is not configured.")
        return INSTAGRAM_CHANNEL_ID
    if platform in {"twitter", "x"}:
        if not TWITTER_CHANNEL_ID:
            raise ValueError("Twitter/X channel ID is not configured.")
        return TWITTER_CHANNEL_ID
    raise ValueError(f"Unsupported platform for Buffer posting: {platform}")


def _graphql_request(query: str, variables: dict, access_token: str) -> dict:
    resp = http_requests.post(
        BUFFER_GQL_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json={"query": query, "variables": variables},
        timeout=45,
    )

    try:
        data = resp.json()
    except Exception:
        raise ValueError(f"Buffer returned non-JSON response ({resp.status_code}): {resp.text[:300]}")

    if not resp.ok:
        raise ValueError(f"Buffer HTTP error {resp.status_code}: {json.dumps(data)[:500]}")

    if data.get("errors"):
        pieces = []
        for err in data["errors"]:
            msg = err.get("message", "Unknown GraphQL error")
            code = (err.get("extensions") or {}).get("code")
            pieces.append(f"{code}: {msg}" if code else msg)
        raise ValueError("Buffer GraphQL error: " + " | ".join(pieces))

    return data


def _build_create_post_variables(request, public_image_url: Optional[str] = None) -> dict:
    """
    Build the variables dict for the createPost GraphQL mutation.
    Uses proper enum values (no quotes in GraphQL variables = passed as strings
    which GraphQL coerces automatically when using variables).
    """
    channel_id = _resolve_channel_id(request.platform)
    platform = (request.platform or "").lower()
    post_type = (request.post_type or "post").lower()

    # Determine scheduling mode and dueAt
    has_schedule = bool(request.scheduled_at)
    
    create_input = {
        "text": request.caption,
        "channelId": channel_id,
        # schedulingType: automatic means Buffer publishes automatically (not notification)
        "schedulingType": "automatic",
        # mode: addToQueue for immediate, customScheduled for future
        "mode": "customScheduled" if has_schedule else "shareNow",
    }

    if has_schedule:
        # Ensure the scheduled_at is a valid future ISO timestamp
        # Add a small buffer (30s) to account for processing time
        try:
            dt = datetime.datetime.fromisoformat(request.scheduled_at.replace("Z", "+00:00"))
            now = datetime.datetime.now(datetime.timezone.utc)
            # If the scheduled time is within 2 minutes of now or in the past, 
            # use addToQueue instead (post immediately via Buffer's queue)
            if (dt - now).total_seconds() < 120:
                create_input["mode"] = "addToQueue"
                del create_input["mode"]  # reset and don't set dueAt
                create_input["mode"] = "addToQueue"
            else:
                create_input["dueAt"] = request.scheduled_at
        except Exception:
            create_input["dueAt"] = request.scheduled_at

    # Platform-specific metadata
    # Per Buffer API docs, metadata is PostInputMetaData with platform-specific keys
    if platform == "instagram":
        ig_post_type = post_type if post_type in {"post", "story", "reel"} else "post"
        create_input["metadata"] = {
            "instagram": {
                "type": ig_post_type,
                "shouldShareToFeed": post_type != "story",
            }
        }

    # Assets: images or video
    if public_image_url:
        create_input["assets"] = {
            "images": [{"url": public_image_url}]
        }
    elif request.video_url:
        create_input["assets"] = {
            "videos": [{"url": request.video_url}]
        }

    return {"input": create_input}


def _create_post_via_graphql(*, request, access_token: str, public_image_url: Optional[str] = None) -> dict:
    # Use variables (not inline literals) so GraphQL enum coercion works correctly
    mutation = """
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        __typename
        ... on PostActionSuccess {
          post {
            id
            text
            dueAt
            status
            assets {
              id
              mimeType
            }
          }
        }
        ... on MutationError {
          message
        }
      }
    }
    """

    variables = _build_create_post_variables(request, public_image_url=public_image_url)
    print(f"[Buffer] Posting with variables: {json.dumps(variables, indent=2)}")
    
    data = _graphql_request(mutation, variables, access_token)

    result = (data.get("data") or {}).get("createPost") or {}
    typename = result.get("__typename")

    if typename == "MutationError" or ("message" in result and "post" not in result):
        raise ValueError(f"Buffer createPost failed: {result.get('message', 'Unknown mutation error')}")

    post = result.get("post")
    if not post:
        raise ValueError(f"Buffer createPost returned no post payload: {json.dumps(result)[:500]}")
    return post


# ─── Internal dataclass (shared by /post-to-buffer and /auto-campaign) ────────

class _BufferPostInternal:
    def __init__(self, platform, post_type, caption, hashtags,
                 image_data_url, video_url, scheduled_at):
        self.platform = platform
        self.post_type = post_type
        self.caption = caption
        self.hashtags = hashtags
        self.image_data_url = image_data_url
        self.video_url = video_url
        self.scheduled_at = scheduled_at


async def _post_to_buffer_core(request, access_token: str) -> dict:
    image_url = None
    if request.image_data_url:
        img_to_upload = request.image_data_url
        if request.post_type == "story":
            img_to_upload = overlay_caption_on_story_image(img_to_upload, request.caption)
        # Always normalize to safe dimensions/format
        img_to_upload = normalize_image_for_buffer(img_to_upload, request.post_type)
        image_url = upload_image_to_imgbb(img_to_upload)
        print(f"[Buffer] Image hosted at: {image_url}")

    return _create_post_via_graphql(
        request=request,
        access_token=access_token,
        public_image_url=image_url,
    )


# ─── /post-to-buffer ─────────────────────────────────────────────────────────

class BufferPostRequest(BaseModel):
    platform: str
    post_type: str = "post"
    caption: str
    hashtags: List[str] = []
    image_data_url: Optional[str] = None
    video_url: Optional[str] = None
    scheduled_at: Optional[str] = None


# ─── /archive ────────────────────────────────────────────────────────────────

class ArchiveGenerateRequest(BaseModel):
    advisor_text: str          # the AI advisor message to extract products from
    tone: str = "engaging"
    platform: str = "instagram"


class ArchiveSaveRequest(BaseModel):
    product_name: str
    caption: str
    hashtags: List[str] = []
    image_url: Optional[str] = None
    campaign_type: str = "social_media"
    platform: str = "instagram"
    tone: str = "engaging"


@router.post("/archive/save")
async def save_single_ad_to_archive(request: ArchiveSaveRequest):
    """Save a single manually-created ad draft directly to the archive."""
    import uuid as _uuid
    from datetime import datetime as _dt
    archive = marketing_service.get_ad_archive()
    ad = {
        "id": str(_uuid.uuid4()),
        "product_name": request.product_name,
        "caption": request.caption,
        "hashtags": request.hashtags,
        "image_url": request.image_url,
        "campaign_type": request.campaign_type,
        "platform": request.platform,
        "tone": request.tone,
        "created_at": _dt.utcnow().isoformat(),
    }
    archive.append(ad)
    marketing_service._save_archive(archive)
    return {"ad": ad}


@router.post("/archive/generate")
async def generate_archive_from_advisor(request: ArchiveGenerateRequest):
    """Extract products from an AI advisor message and batch-generate ad drafts."""
    try:
        ads = marketing_service.generate_ad_drafts_from_text(
            request.advisor_text, request.tone, request.platform
        )
        return {"ads": ads, "count": len(ads)}
    except Exception as e:
        raise HTTPException(500, f"Archive generation failed: {str(e)}")


@router.get("/archive")
async def get_archive():
    """Return all saved ad drafts."""
    return {"ads": marketing_service.get_ad_archive()}


@router.delete("/archive/{ad_id}")
async def delete_archive_ad(ad_id: str):
    """Remove a specific ad draft from the archive."""
    ok = marketing_service.delete_ad_from_archive(ad_id)
    if not ok:
        raise HTTPException(404, "Ad not found in archive")
    return {"success": True}


@router.post("/archive/{ad_id}/generate-image")
async def generate_image_for_archive_ad(ad_id: str):
    """Generate and attach an image to an archived ad draft."""
    archive = marketing_service.get_ad_archive()
    ad = next((a for a in archive if a["id"] == ad_id), None)
    if not ad:
        raise HTTPException(404, "Ad not found in archive")
    try:
        image_url = marketing_service.generate_marketing_image(
            product_name=ad["product_name"],
            campaign_type=ad.get("campaign_type", "social_media"),
            post_type="post",
        )
        if not image_url:
            raise HTTPException(500, "Image generation returned no result")
        # Persist image_url back to archive
        updated = [
            {**a, "image_url": image_url} if a["id"] == ad_id else a
            for a in archive
        ]
        marketing_service._save_archive(updated)
        return {"image_url": image_url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Image generation failed: {str(e)}")


@router.post("/post-to-buffer")
async def post_to_buffer(request: BufferPostRequest):
    try:
        api_key = os.getenv("BUFFER_ACCESS_TOKEN")
        if not api_key:
            raise ValueError("BUFFER_ACCESS_TOKEN not set in .env")

        req = _BufferPostInternal(
            platform=request.platform,
            post_type=request.post_type,
            caption=request.caption,
            hashtags=request.hashtags,
            image_data_url=request.image_data_url,
            video_url=request.video_url,
            scheduled_at=request.scheduled_at,
        )
        post = await _post_to_buffer_core(req, api_key)
        return {"success": True, "post": post}

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Post to Buffer failed: {str(e)}")