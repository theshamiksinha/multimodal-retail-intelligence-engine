from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import json
import numpy as np
import os

load_dotenv()


class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        return super().default(obj)


class CustomJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(content, cls=NumpyEncoder, ensure_ascii=False).encode("utf-8")


from app.routers import video_analytics, sales_inventory, marketing, advisor, floor_plan

app = FastAPI(
    title="Retail Intelligence Platform",
    description="Multimodal AI platform for SME retail analytics, marketing, and decision support",
    version="1.0.0",
    default_response_class=CustomJSONResponse,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (generated heatmaps, marketing images, etc.)
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(video_analytics.router, prefix="/api/video", tags=["Video Analytics"])
app.include_router(sales_inventory.router, prefix="/api/sales", tags=["Sales & Inventory"])
app.include_router(marketing.router, prefix="/api/marketing", tags=["Marketing"])
app.include_router(advisor.router, prefix="/api/advisor", tags=["AI Advisor"])
app.include_router(floor_plan.router, prefix="/api/floorplan", tags=["Floor Plan"])


@app.get("/")
def root():
    return {"message": "Retail Intelligence Platform API", "version": "1.0.0"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
