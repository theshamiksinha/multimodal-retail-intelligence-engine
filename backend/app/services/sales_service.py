import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import os

# In-memory data store
_sales_data: pd.DataFrame | None = None
_inventory_data: pd.DataFrame | None = None

# ── Auto-load real CSV files if they exist ────────────────────────────────────
# Backend CWD is backend/, real data lives one level up in ../data/
_DATA_DIR           = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data")
_REAL_SALES_CSV     = os.path.join(_DATA_DIR, "pos_sales.csv")
_REAL_INVENTORY_CSV = os.path.join(_DATA_DIR, "inventory.csv")


def _try_load_real_data():
    """Load real CSV files on startup if they exist, mapping columns to what the service expects."""
    global _sales_data, _inventory_data

    if os.path.exists(_REAL_SALES_CSV):
        try:
            df = pd.read_csv(_REAL_SALES_CSV)
            # Map actual CSV columns → internal names expected by get_sales_summary()
            if "line_total" in df.columns and "revenue" not in df.columns:
                df = df.rename(columns={"line_total": "revenue"})
            if "gross_profit" in df.columns and "cost" not in df.columns:
                df["cost"] = df["revenue"] - df["gross_profit"]
            _sales_data = df
            print(f"[sales_service] Loaded {len(df):,} rows from {_REAL_SALES_CSV}")
        except Exception as e:
            print(f"[sales_service] Could not load {_REAL_SALES_CSV}: {e}")

    if os.path.exists(_REAL_INVENTORY_CSV):
        try:
            df = pd.read_csv(_REAL_INVENTORY_CSV)
            _inventory_data = df
            print(f"[sales_service] Loaded {len(df):,} rows from {_REAL_INVENTORY_CSV}")
        except Exception as e:
            print(f"[sales_service] Could not load {_REAL_INVENTORY_CSV}: {e}")


_try_load_real_data()


def generate_sample_data():
    """Generate realistic sample sales and inventory data for a small retail store."""
    global _sales_data, _inventory_data
    np.random.seed(42)

    products = [
        {"id": "P001", "name": "Whole Milk 1L", "category": "Dairy", "price": 3.49, "cost": 2.10},
        {"id": "P002", "name": "Sourdough Bread", "category": "Bakery", "price": 4.99, "cost": 2.50},
        {"id": "P003", "name": "Organic Eggs (12pk)", "category": "Dairy", "price": 5.99, "cost": 3.50},
        {"id": "P004", "name": "Archi POP's Chips (4pk)", "category": "Snacks", "price": 6.49, "cost": 3.20},
        {"id": "P005", "name": "Cold Brew Coffee", "category": "Beverages", "price": 4.29, "cost": 1.80},
        {"id": "P006", "name": "Greek Yogurt 500g", "category": "Dairy", "price": 3.99, "cost": 2.20},
        {"id": "P007", "name": "Sparkling Water (6pk)", "category": "Beverages", "price": 5.49, "cost": 2.80},
        {"id": "P008", "name": "Dark Chocolate Bar", "category": "Snacks", "price": 3.29, "cost": 1.50},
        {"id": "P009", "name": "Fresh Orange Juice 1L", "category": "Beverages", "price": 4.79, "cost": 2.60},
        {"id": "P010", "name": "Winter Scarf (Wool)", "category": "Seasonal", "price": 19.99, "cost": 8.00},
        {"id": "P011", "name": "Summer Hat (Straw)", "category": "Seasonal", "price": 14.99, "cost": 5.50},
        {"id": "P012", "name": "Trail Mix 250g", "category": "Snacks", "price": 4.49, "cost": 2.30},
        {"id": "P013", "name": "Almond Milk 1L", "category": "Dairy", "price": 3.99, "cost": 2.40},
        {"id": "P014", "name": "Croissants (4pk)", "category": "Bakery", "price": 5.49, "cost": 2.80},
        {"id": "P015", "name": "Energy Drink Can", "category": "Beverages", "price": 2.99, "cost": 1.20},
    ]

    # Generate 90 days of sales
    sales_records = []
    base_date = datetime(2026, 1, 1)

    for day in range(90):
        date = base_date + timedelta(days=day)
        is_weekend = date.weekday() >= 5

        for product in products:
            # Base demand varies by product
            base_demand = {
                "Dairy": 8, "Bakery": 6, "Snacks": 4,
                "Beverages": 10, "Seasonal": 2,
            }[product["category"]]

            # Weekend boost
            if is_weekend:
                base_demand = int(base_demand * 1.4)

            # Seasonal adjustments (winter = Jan-Feb)
            if product["category"] == "Seasonal":
                if "Winter" in product["name"] and date.month <= 2:
                    base_demand = 5
                elif "Summer" in product["name"] and date.month >= 3:
                    base_demand = 4
                else:
                    base_demand = 1

            # Add some trend (beverages growing)
            if product["category"] == "Beverages":
                base_demand += day // 30

            qty = max(0, np.random.poisson(base_demand))
            if qty > 0:
                sales_records.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "category": product["category"],
                    "quantity": qty,
                    "unit_price": product["price"],
                    "revenue": round(qty * product["price"], 2),
                    "cost": round(qty * product["cost"], 2),
                })

    _sales_data = pd.DataFrame(sales_records)

    # Generate inventory data
    inventory_records = []
    for product in products:
        stock = np.random.randint(5, 100)
        days_to_expiry = None

        if product["category"] in ["Dairy", "Bakery", "Beverages"]:
            days_to_expiry = np.random.randint(1, 30)

        inventory_records.append({
            "product_id": product["id"],
            "product_name": product["name"],
            "category": product["category"],
            "current_stock": stock,
            "unit_price": product["price"],
            "unit_cost": product["cost"],
            "days_to_expiry": days_to_expiry,
            "reorder_point": 15,
            "supplier_lead_days": np.random.randint(2, 7),
        })

    _inventory_data = pd.DataFrame(inventory_records)

    # Save to CSV for reference
    os.makedirs("app/data/sample", exist_ok=True)
    _sales_data.to_csv("app/data/sample/sales.csv", index=False)
    _inventory_data.to_csv("app/data/sample/inventory.csv", index=False)

    return {"sales_records": len(sales_records), "products": len(products)}


def load_sales_csv(file_path: str):
    global _sales_data
    _sales_data = pd.read_csv(file_path)
    return {"records": len(_sales_data)}


def load_inventory_csv(file_path: str):
    global _inventory_data
    _inventory_data = pd.read_csv(file_path)
    return {"records": len(_inventory_data)}


def reset_inventory():
    """Clear in-memory inventory so the next call falls back to sample data."""
    global _inventory_data
    _inventory_data = None


def reset_sales():
    """Clear in-memory sales data so the next call falls back to sample data."""
    global _sales_data
    _sales_data = None


def get_sales_summary() -> dict:
    if _sales_data is None:
        generate_sample_data()

    df = _sales_data

    total_revenue = round(df["revenue"].sum(), 2)
    total_items = int(df["quantity"].sum())
    # cost column may not exist if real CSV had no cost field
    if "cost" in df.columns:
        total_profit = round((df["revenue"] - df["cost"]).sum(), 2)
    else:
        total_profit = 0.0

    # Top products by revenue
    top = df.groupby("product_name").agg(
        total_revenue=("revenue", "sum"),
        total_qty=("quantity", "sum"),
    ).sort_values("total_revenue", ascending=False).head(5)

    top_products = [
        {"name": name, "revenue": round(row["total_revenue"], 2), "quantity": int(row["total_qty"])}
        for name, row in top.iterrows()
    ]

    # Slow movers
    slow = df.groupby("product_name").agg(
        total_qty=("quantity", "sum"),
        total_revenue=("revenue", "sum"),
    ).sort_values("total_qty", ascending=True).head(5)

    slow_movers = [
        {"name": name, "revenue": round(row["total_revenue"], 2), "quantity": int(row["total_qty"])}
        for name, row in slow.iterrows()
    ]

    # Category breakdown
    cat = df.groupby("category").agg(
        revenue=("revenue", "sum"),
        quantity=("quantity", "sum"),
    ).sort_values("revenue", ascending=False)

    categories = [
        {"category": name, "revenue": round(row["revenue"], 2), "quantity": int(row["quantity"])}
        for name, row in cat.iterrows()
    ]

    # Daily trend
    daily = df.groupby("date").agg(revenue=("revenue", "sum")).reset_index()
    # Weekly moving average
    daily["ma7"] = daily["revenue"].rolling(7, min_periods=1).mean()
    trends = [
        {"date": row["date"], "revenue": round(row["revenue"], 2), "ma7": round(row["ma7"], 2)}
        for _, row in daily.iterrows()
    ]

    return {
        "total_revenue": total_revenue,
        "total_items_sold": total_items,
        "total_profit": total_profit,
        "top_products": top_products,
        "slow_movers": slow_movers,
        "categories": categories,
        "trends": trends,
    }


def _safe_records(df: pd.DataFrame) -> list[dict]:
    """Convert a DataFrame to JSON-safe records: NaN → None, numpy scalars → Python natives."""
    records = []
    for row in df.to_dict("records"):
        clean = {}
        for k, v in row.items():
            if isinstance(v, (np.integer,)):
                clean[k] = int(v)
            elif isinstance(v, (np.floating,)):
                clean[k] = None if np.isnan(v) else float(v)
            elif isinstance(v, float) and (v != v):   # float NaN
                clean[k] = None
            elif isinstance(v, np.bool_):
                clean[k] = bool(v)
            else:
                clean[k] = v
        records.append(clean)
    return records


def get_inventory_status() -> dict:
    if _inventory_data is None:
        generate_sample_data()

    df = _inventory_data.copy()

    # ── Filter on the ORIGINAL df (numeric dtypes, NaN works correctly) ──────
    # Doing df.where(notna, None) BEFORE filtering converts numeric cols to
    # object dtype, which makes <= comparisons raise TypeError in pandas 2.x.
    expiring_mask = df["days_to_expiry"].notna() & (df["days_to_expiry"] <= 7)
    low_stock_mask = df["current_stock"] <= df["reorder_point"]
    overstock_mask = df["current_stock"] > 80

    total_value = round((df["current_stock"] * df["unit_cost"]).sum(), 2)

    return {
        "total_products":        len(df),
        "total_inventory_value": total_value,
        "expiring_soon":         _safe_records(df[expiring_mask]),
        "low_stock":             _safe_records(df[low_stock_mask]),
        "overstock":             _safe_records(df[overstock_mask]),
        "all_items":             _safe_records(df),
    }


def get_context_for_advisor() -> str:
    """Return a text summary of sales and inventory for the AI advisor."""
    sales = get_sales_summary()
    inventory = get_inventory_status()

    lines = [
        "=== SALES SUMMARY (Last 90 Days) ===",
        f"Total Revenue: ${sales['total_revenue']:,.2f}",
        f"Total Items Sold: {sales['total_items_sold']:,}",
        f"Total Profit: ${sales['total_profit']:,.2f}",
        "",
        "Top 5 Products by Revenue:",
    ]
    for p in sales["top_products"]:
        lines.append(f"  - {p['name']}: ${p['revenue']:,.2f} ({p['quantity']} units)")

    lines.append("\nSlowest Moving Products:")
    for p in sales["slow_movers"]:
        lines.append(f"  - {p['name']}: ${p['revenue']:,.2f} ({p['quantity']} units)")

    lines.append("\nCategory Breakdown:")
    for c in sales["categories"]:
        lines.append(f"  - {c['category']}: ${c['revenue']:,.2f} ({c['quantity']} units)")

    lines.append("\n=== INVENTORY STATUS ===")
    lines.append(f"Total Inventory Value: ${inventory['total_inventory_value']:,.2f}")

    if inventory["expiring_soon"]:
        lines.append("\nProducts Expiring Soon (within 7 days):")
        for item in inventory["expiring_soon"]:
            lines.append(f"  - {item['product_name']}: {item['current_stock']} units, expires in {item['days_to_expiry']} days")

    if inventory["low_stock"]:
        lines.append("\nLow Stock Alert:")
        for item in inventory["low_stock"]:
            lines.append(f"  - {item['product_name']}: {item['current_stock']} units (reorder point: {item['reorder_point']})")

    return "\n".join(lines)

def save_inventory_csv():
    global _inventory_data
    if _inventory_data is None:
        return

    os.makedirs(_DATA_DIR, exist_ok=True)
    _inventory_data.to_csv(_REAL_INVENTORY_CSV, index=False)