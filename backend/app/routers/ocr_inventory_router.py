import os
import httpx
from fastapi import APIRouter, UploadFile, File, HTTPException

from app.routers.voice_inventory_router import parse_products_with_mistral

router = APIRouter()

OCR_SPACE_API_KEY = os.environ.get("OCR_SPACE_API_KEY")


import httpx
from fastapi import HTTPException

async def extract_text_with_ocr_space(image_bytes: bytes, filename: str = "scan.png") -> str:
    url = "https://api.ocr.space/parse/image"

    files = {
        "filename": (filename, image_bytes),
    }

    data = {
        "apikey": OCR_SPACE_API_KEY,
        "language": "eng",
        "isOverlayRequired": "false",
        "OCREngine": "2",   # try 2 first; 3 can be slower
        "scale": "true",
        "detectOrientation": "true",
    }

    timeout = httpx.Timeout(connect=20.0, read=120.0, write=120.0, pool=120.0)

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.post(url, data=data, files=files)
    except httpx.ReadTimeout:
        raise HTTPException(
            504,
            "OCR request timed out. The OCR API is taking too long to respond. Try again or use a smaller/clearer image."
        )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"OCR request failed: {str(e)}")

    if resp.status_code != 200:
        raise HTTPException(502, f"OCR.space error {resp.status_code}: {resp.text[:300]}")

    payload = resp.json()

    if payload.get("IsErroredOnProcessing"):
        errs = payload.get("ErrorMessage") or payload.get("ErrorDetails") or "OCR failed"
        raise HTTPException(422, str(errs))

    parsed = payload.get("ParsedResults") or []
    text = "\n".join(
        (item.get("ParsedText") or "").strip()
        for item in parsed
        if item.get("ParsedText")
    ).strip()

    if not text:
        raise HTTPException(422, "No readable text found in image.")

    return text

@router.post("/ocr/scan-and-parse")
async def ocr_scan_and_parse(image: UploadFile = File(...)):
    content_type = image.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(400, "Please upload an image file.")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(400, "Uploaded image is empty.")

    ocr_text = await extract_text_with_ocr_space(
        image_bytes=image_bytes,
        filename=image.filename or "scan.png",
    )

    products = await parse_products_with_mistral(ocr_text)

    return {
        "ocr_text": ocr_text,
        "products": products,
    }