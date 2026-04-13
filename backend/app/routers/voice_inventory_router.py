"""
voice_inventory_router.py
Drop this file into your routers/ folder and register it in main.py:
    from app.routers import voice_inventory_router
    app.include_router(voice_inventory_router.router, prefix="/api")
"""

import os
import json
import base64
import httpx
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from app.services import sales_service

router = APIRouter()

GOOGLE_STT_API_KEY = os.environ.get("GOOGLE_STT_API_KEY", "")
MISTRAL_API_KEY    = os.environ.get("MISTRAL_API_KEY", "")


# ── Pydantic models ────────────────────────────────────────────────────────────

class ParsedProduct(BaseModel):
    product_name: str
    category: str
    current_stock: int
    unit_price: float
    unit_cost: Optional[float] = None
    days_to_expiry: Optional[int] = None
    reorder_point: int = 15
    supplier_lead_days: int = 3


class ConfirmAddRequest(BaseModel):
    products: List[ParsedProduct]


# ── Helpers ────────────────────────────────────────────────────────────────────

async def transcribe_audio_google(audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
    """Transcribe audio bytes via Google Speech-to-Text REST API v1."""
    if not GOOGLE_STT_API_KEY:
        raise HTTPException(500, "GOOGLE_STT_API_KEY not set in environment variables.")

    encoding_map = {
        "audio/webm":             "WEBM_OPUS",
        "audio/webm;codecs=opus": "WEBM_OPUS",
        "audio/ogg":              "OGG_OPUS",
        "audio/ogg;codecs=opus":  "OGG_OPUS",
        "audio/mp4":              "MP4",
        "audio/wav":              "LINEAR16",
        "audio/x-wav":            "LINEAR16",
    }
    encoding = encoding_map.get(mime_type.split(";")[0].strip(), "WEBM_OPUS")
    audio_b64 = base64.b64encode(audio_bytes).decode()

    payload = {
        "config": {
            "encoding": encoding,
            "sampleRateHertz": 48000,
            "languageCode": "en-US",
            "enableAutomaticPunctuation": True,
            "model": "latest_short",
        },
        "audio": {"content": audio_b64},
    }

    url = f"https://speech.googleapis.com/v1/speech:recognize?key={GOOGLE_STT_API_KEY}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload)

    if resp.status_code != 200:
        raise HTTPException(502, f"Google STT error {resp.status_code}: {resp.text[:400]}")

    data    = resp.json()
    results = data.get("results", [])
    if not results:
        raise HTTPException(422, "No speech detected. Please speak clearly and try again.")

    transcript = " ".join(
        r["alternatives"][0]["transcript"]
        for r in results
        if r.get("alternatives")
    )
    return transcript.strip()


async def parse_products_with_mistral(transcript: str) -> list:
    """Extract one or more product records from a natural-language transcript using Mistral."""
    if not MISTRAL_API_KEY:
        raise HTTPException(500, "MISTRAL_API_KEY not set in environment variables.")

    categories = [
        "Dairy", "Bakery", "Snacks", "Beverages", "Seasonal",
        "Produce", "Frozen", "Personal Care", "Household", "Other",
    ]

    system_prompt = (
        "You are an inventory assistant for a small retail store. "
        "Extract ALL products mentioned in the user's voice transcript. "
        "Return ONLY a raw JSON array — no markdown fences, no explanation. "
        "Each object must include:\n"
        "  product_name (string), "
        f"  category (one of: {', '.join(categories)}), "
        "  current_stock (integer), "
        "  unit_price (float, USD), "
        "  unit_cost (float or null if not mentioned), "
        "  days_to_expiry (integer or null if not perishable/not mentioned), "
        "  reorder_point (integer, default 15 if not mentioned), "
        "  supplier_lead_days (integer, default 3 if not mentioned).\n"
        "Use reasonable defaults when values are not stated. "
        "Output ONLY the JSON array, nothing else."
    )

    payload = {
        "model": "mistral-small-latest",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": f"Transcript: \"{transcript}\""},
        ],
        "temperature": 0.1,
        "max_tokens": 1024,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.mistral.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {MISTRAL_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code != 200:
        raise HTTPException(502, f"Mistral API error {resp.status_code}: {resp.text[:400]}")

    raw = resp.json()["choices"][0]["message"]["content"].strip()

    # Strip accidental markdown fences
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            parsed = [parsed]
        return parsed
    except json.JSONDecodeError as exc:
        raise HTTPException(
            422,
            f"Mistral returned unparseable JSON: {exc}. Raw output: {raw[:300]}"
        )


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/voice/transcribe-and-parse")
async def voice_transcribe_and_parse(
    audio: UploadFile = File(..., description="Audio blob from MediaRecorder (webm/ogg/wav)"),
):
    """
    Step 1 — Transcribe with Google STT, parse with Mistral.
    Returns transcript + structured product list for user to review.
    """
    audio_bytes = await audio.read()
    mime_type   = audio.content_type or "audio/webm"

    transcript = await transcribe_audio_google(audio_bytes, mime_type)
    products   = await parse_products_with_mistral(transcript)

    return {"transcript": transcript, "products": products}


@router.post("/voice/confirm-add")
async def voice_confirm_add(request: ConfirmAddRequest):
    """
    Step 2 — User confirmed the parsed products; append them to the in-memory inventory DataFrame.
    """
    import pandas as pd

    if sales_service._inventory_data is None:
        sales_service.generate_sample_data()

    df = sales_service._inventory_data
    existing_count = len(df)

    new_rows = []
    for idx, p in enumerate(request.products):
        new_id = f"V{existing_count + idx + 1:03d}"
        new_rows.append({
            "product_id":         new_id,
            "product_name":       p.product_name,
            "category":           p.category,
            "current_stock":      p.current_stock,
            "unit_price":         p.unit_price,
            "unit_cost":          p.unit_cost if p.unit_cost is not None else round(p.unit_price * 0.6, 2),
            "days_to_expiry":     p.days_to_expiry,
            "reorder_point":      p.reorder_point,
            "supplier_lead_days": p.supplier_lead_days,
        })

    sales_service._inventory_data = pd.concat(
        [df, pd.DataFrame(new_rows)], ignore_index=True
    )
    sales_service.save_inventory_csv()
    return {
        "message": f"{len(new_rows)} product(s) successfully added to inventory.",
        "added": new_rows,
        "total_products": len(sales_service._inventory_data),
    }