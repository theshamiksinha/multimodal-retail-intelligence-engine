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
