import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException

from app.services import sales_service

router = APIRouter()


@router.get("/summary")
async def get_sales_summary():
    """Get sales analytics summary."""
    return sales_service.get_sales_summary()


@router.get("/inventory")
async def get_inventory_status():
    """Get current inventory status with alerts."""
    return sales_service.get_inventory_status()


@router.post("/upload/sales")
async def upload_sales_csv(file: UploadFile = File(...)):
    """Upload a sales CSV file."""
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Please upload a CSV file.")

    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/sales_{uuid.uuid4()}.csv"

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    result = sales_service.load_sales_csv(file_path)
    return {"message": "Sales data loaded", **result}


@router.post("/upload/inventory")
async def upload_inventory_csv(file: UploadFile = File(...)):
    """Upload an inventory CSV file."""
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Please upload a CSV file.")

    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/inventory_{uuid.uuid4()}.csv"

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    result = sales_service.load_inventory_csv(file_path)
    return {"message": "Inventory data loaded", **result}


@router.post("/generate-sample")
async def generate_sample_data():
    """Generate sample sales and inventory data for demo."""
    result = sales_service.generate_sample_data()
    return {"message": "Sample data generated", **result}
