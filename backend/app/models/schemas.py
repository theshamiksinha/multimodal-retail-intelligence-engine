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
    # Core totals
    total_revenue: float
    total_items_sold: int
    total_profit: float
    avg_order_value: float

    # Trend & growth
    growth_pct: float
    trend_direction: str           # "up" | "down" | "stable"
    peak_day: Optional[str] = None
    worst_day: Optional[str] = None

    # Product & category breakdowns
    top_products: list[dict]       # [{name, revenue, quantity}, ...]
    slow_movers: list[dict]        # [{name, revenue, quantity}, ...]
    categories: list[dict]         # [{category, revenue, quantity}, ...]

    # Underperformance signals
    underperforming_products: list[dict]       # statistical (decline_ratio < 0.2)
    underperforming_products_ml: list[str]     # ML cluster-flagged product names

    # ML outputs
    anomalies: list[dict]          # [{date, revenue, type: "spike"|"drop"}, ...]
    forecast_7d: list[dict]        # [{day, forecast_revenue}, ...]
    product_clusters: list[dict]   # [{product_name, cluster, is_underperforming}, ...]

    # Time series
    trends: list[dict]             # [{date, revenue, quantity, ma7, std7}, ...]

    # Legacy field kept for backward compatibility
    expiring_soon: list[dict] = []


class InventoryDataResponse(BaseModel):
    total_products: int
    total_inventory_value: float

    # Rule-based alerts
    low_stock: list[dict]              # current_stock <= reorder_point
    expiring_soon: list[dict]          # 0 < days_to_expiry <= 7
    overstock: list[dict]              # current_stock > 80
    stockout_risk: list[dict]          # days_of_cover < supplier_lead_days

    # Statistical signals
    slow_moving_inventory: list[dict]  # bottom 25% of total_sold (active products)
    dead_stock: list[dict]             # total_sold == 0

    # Full enriched table (includes days_of_cover, daily_avg, total_sold)
    all_items: list[dict]


class MarketingRequest(BaseModel):
    product_name: str
    product_description: Optional[str] = ""
    campaign_type: str = "social_media"   # social_media | clearance | seasonal
    tone: str = "engaging"                # engaging | urgent | casual | professional
    platform: str = "instagram"           # instagram | facebook | twitter
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
