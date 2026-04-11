import os
import requests as http_requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.models.schemas import MarketingRequest
from app.services import marketing_service, sales_service

router = APIRouter()


@router.post("/generate")
async def generate_marketing_content(request: MarketingRequest):
    """Generate marketing caption and optionally an image for a product."""
    try:
        result = marketing_service.generate_marketing_caption(
            product_name=request.product_name,
            product_description=request.product_description,
            campaign_type=request.campaign_type,
            tone=request.tone,
            platform=request.platform,
        )

        image_url = None
        if request.generate_image:
            image_url = marketing_service.generate_marketing_image(
                product_name=request.product_name,
                campaign_type=request.campaign_type,
            )

        return {
            "caption": result["caption"],
            "hashtags": result["hashtags"],
            "image_url": image_url,
            "platform": result["platform"],
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Marketing generation failed: {str(e)}")


@router.post("/campaign")
async def generate_campaign(goal: str = "promote top products"):
    """Generate a full marketing campaign based on current sales data."""
    try:
        sales_context = sales_service.get_context_for_advisor()
        result = marketing_service.generate_campaign_from_data(sales_context, goal)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Campaign generation failed: {str(e)}")


class BufferPostRequest(BaseModel):
    channel_id: str
    caption: str
    hashtags: list[str] = []
    image_data_url: str | None = None


@router.post("/post-to-buffer")
async def post_to_buffer(request: BufferPostRequest):
    """Post generated marketing content to a Buffer profile."""
    access_token = os.getenv("BUFFER_ACCESS_TOKEN")
    if not access_token:
        raise HTTPException(400, "BUFFER_ACCESS_TOKEN not set in .env")

    text = request.caption + "\n\n" + " ".join(request.hashtags)

    resp = http_requests.post(
        "https://api.bufferapp.com/1/updates/create.json",
        data={
            "access_token": access_token,
            "profile_ids[]": request.channel_id,
            "text": text,
        },
        timeout=15,
    )

    if not resp.ok:
        raise HTTPException(502, f"Buffer API error: {resp.text}")

    return {"success": True}
