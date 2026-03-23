from pydantic import BaseModel
from typing import Optional


class VideoUploadResponse(BaseModel):
    session_id: str
    message: str
    frame_count: int
    people_detected: int


class HeatmapResponse(BaseModel):
    session_id: str
    heatmap_url: str
    zones: list[dict]
    dwell_times: list[dict]


class SalesDataResponse(BaseModel):
    total_revenue: float
    total_items_sold: int
    top_products: list[dict]
    slow_movers: list[dict]
    expiring_soon: list[dict]
    trends: list[dict]


class MarketingRequest(BaseModel):
    product_name: str
    product_description: Optional[str] = ""
    campaign_type: str = "social_media"  # social_media, clearance, seasonal
    tone: str = "engaging"  # engaging, urgent, casual, professional
    platform: str = "instagram"  # instagram, facebook, twitter
    generate_image: bool = True


class MarketingResponse(BaseModel):
    caption: str
    hashtags: list[str]
    image_url: Optional[str] = None
    platform: str


class AdvisorMessage(BaseModel):
    message: str
    session_id: Optional[str] = "default"


class AdvisorResponse(BaseModel):
    response: str
    suggestions: list[str] = []
    data_references: list[str] = []
