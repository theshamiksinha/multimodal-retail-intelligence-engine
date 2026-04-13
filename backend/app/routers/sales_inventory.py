import os
import shutil
import uuid
from pathlib import Path
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException

from app.services import sales_service

router = APIRouter()

_DATA_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "data")
)
INVENTORY_CSV = os.path.join(_DATA_DIR, "inventory.csv")
SALES_CSV     = os.path.join(_DATA_DIR, "pos_sales.csv")


@router.get("/summary")
async def get_sales_summary():
    """Get sales analytics summary."""
    return sales_service.get_sales_summary()


@router.get("/inventory")
async def get_inventory_status():
    """Get current inventory status with alerts."""
    return sales_service.get_inventory_status()


@router.get("/inventory/file-info")
async def get_inventory_file_info():
    """Return metadata about the currently loaded inventory file."""
    if os.path.exists(INVENTORY_CSV):
        try:
            df = pd.read_csv(INVENTORY_CSV)
            return {"loaded": True, "filename": "inventory.csv", "records": len(df)}
        except Exception:
            pass
    return {"loaded": False, "filename": None, "records": 0}


@router.post("/upload/inventory")
async def upload_inventory_csv(file: UploadFile = File(...)):
    """Upload a CSV or Excel inventory file. Replaces the existing inventory.csv."""
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".csv", ".xlsx", ".xls"):
        raise HTTPException(400, "Please upload a CSV or Excel (.xlsx / .xls) file.")

    # Write to a temp file first so we can validate before overwriting
    os.makedirs("uploads", exist_ok=True)
    tmp_path = f"uploads/tmp_inventory_{uuid.uuid4()}{suffix}"
    try:
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Validate it can be parsed
        try:
            df = pd.read_csv(tmp_path) if suffix == ".csv" else pd.read_excel(tmp_path)
        except Exception as e:
            raise HTTPException(400, f"Could not parse file: {e}")

        # Overwrite the canonical inventory.csv
        os.makedirs(os.path.dirname(INVENTORY_CSV), exist_ok=True)
        df.to_csv(INVENTORY_CSV, index=False)

        # Reload in-memory data
        sales_service.load_inventory_csv(INVENTORY_CSV)

        return {
            "message": "Inventory data loaded",
            "records": len(df),
            "filename": file.filename,
        }
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.delete("/inventory/file")
async def delete_inventory_file():
    """Remove the uploaded inventory CSV and fall back to sample data."""
    if os.path.exists(INVENTORY_CSV):
        os.remove(INVENTORY_CSV)
    sales_service.reset_inventory()
    return {"message": "Inventory file removed. Sample data will be used."}


@router.get("/sales/file-info")
async def get_sales_file_info():
    """Return metadata about the currently loaded POS sales file."""
    if os.path.exists(SALES_CSV):
        try:
            df = pd.read_csv(SALES_CSV)
            return {"loaded": True, "filename": "pos_sales.csv", "records": len(df)}
        except Exception:
            pass
    return {"loaded": False, "filename": None, "records": 0}


@router.post("/upload/sales")
async def upload_sales_csv(file: UploadFile = File(...)):
    """Upload a CSV or Excel POS sales file. Replaces the existing pos_sales.csv."""
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".csv", ".xlsx", ".xls"):
        raise HTTPException(400, "Please upload a CSV or Excel (.xlsx / .xls) file.")

    os.makedirs("uploads", exist_ok=True)
    tmp_path = f"uploads/tmp_sales_{uuid.uuid4()}{suffix}"
    try:
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        try:
            df = pd.read_csv(tmp_path) if suffix == ".csv" else pd.read_excel(tmp_path)
        except Exception as e:
            raise HTTPException(400, f"Could not parse file: {e}")

        os.makedirs(_DATA_DIR, exist_ok=True)
        df.to_csv(SALES_CSV, index=False)
        sales_service.load_sales_csv(SALES_CSV)

        return {"message": "Sales data loaded", "records": len(df), "filename": file.filename}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.delete("/sales/file")
async def delete_sales_file():
    """Remove the uploaded POS sales CSV and fall back to sample data."""
    if os.path.exists(SALES_CSV):
        os.remove(SALES_CSV)
    sales_service.reset_sales()
    return {"message": "Sales file removed. Sample data will be used."}


@router.post("/generate-sample")
async def generate_sample_data():
    """Generate sample sales and inventory data for demo."""
    result = sales_service.generate_sample_data()
    return {"message": "Sample data generated", **result}
