"""
Generate synthetic POS data for the Retail Intelligence Platform.

Outputs two CSV files in data/:
  - pos_sales.csv      : transaction-level sales records (one row per product per transaction)
  - inventory.csv      : current inventory snapshot per product

Run with:  python3 generate_data.py
"""

import csv
import os
import random
import uuid
from datetime import datetime, timedelta, date

random.seed(42)

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Product catalogue ────────────────────────────────────────────────────────
# Fields: id, name, category, sub_category, brand, unit_price, unit_cost,
#         shelf_life_days (None = non-perishable), reorder_point, store_section

PRODUCTS = [
    # Dairy
    ("P001", "Whole Milk 1L",           "Dairy",        "Milk",        "Amul",        52.00, 38.00,  7,  30, "Refrigerated"),
    ("P002", "Skimmed Milk 500ml",       "Dairy",        "Milk",        "Mother Dairy",28.00, 20.00,  5,  25, "Refrigerated"),
    ("P003", "Paneer 200g",             "Dairy",        "Cheese",      "Amul",        85.00, 60.00,  5,  15, "Refrigerated"),
    ("P004", "Greek Yogurt 400g",        "Dairy",        "Yogurt",      "Epigamia",    80.00, 55.00,  7,  20, "Refrigerated"),
    ("P005", "Butter 100g",             "Dairy",        "Butter",      "Amul",        55.00, 40.00, 30,  20, "Refrigerated"),
    ("P006", "Cheese Slices 200g",       "Dairy",        "Cheese",      "Britannia",   95.00, 68.00, 21,  15, "Refrigerated"),

    # Bakery
    ("P007", "Sourdough Bread 400g",     "Bakery",       "Bread",       "Modern",      65.00, 40.00,  4,  20, "Bakery Shelf"),
    ("P008", "Multigrain Bread 400g",    "Bakery",       "Bread",       "Harvest Gold",60.00, 38.00,  4,  20, "Bakery Shelf"),
    ("P009", "Butter Croissant 4pk",     "Bakery",       "Pastry",      "La Boulange",  90.00, 58.00,  3,  15, "Bakery Shelf"),
    ("P010", "Digestive Biscuits 250g",  "Bakery",       "Biscuits",    "McVitie's",   55.00, 35.00, 180, 25, "Dry Goods"),

    # Beverages
    ("P011", "Cold Brew Coffee 250ml",   "Beverages",    "Coffee",      "Blue Tokai",  85.00, 52.00,  7,  20, "Refrigerated"),
    ("P012", "Sparkling Water 500ml",    "Beverages",    "Water",       "Evian",       60.00, 38.00, 365, 30, "Beverages Aisle"),
    ("P013", "Fresh Orange Juice 1L",    "Beverages",    "Juice",       "Tropicana",   95.00, 62.00,  5,  20, "Refrigerated"),
    ("P014", "Green Tea 20 bags",        "Beverages",    "Tea",         "Tetley",      120.00, 75.00,730, 15, "Dry Goods"),
    ("P015", "Energy Drink 250ml",       "Beverages",    "Energy",      "Monster",     115.00, 72.00,180, 20, "Beverages Aisle"),
    ("P016", "Coconut Water 330ml",      "Beverages",    "Water",       "Raw Pressery", 70.00, 44.00, 14, 25, "Refrigerated"),
    ("P017", "Almond Milk 1L",           "Beverages",    "Plant Milk",  "Epigamia",    130.00, 85.00, 14, 15, "Refrigerated"),

    # Snacks
    ("P018", "Archi POPs Chips 4pk",     "Snacks",       "Chips",       "Archi POP's", 120.00, 72.00,180, 20, "Snacks Aisle"),
    ("P019", "Trail Mix 250g",           "Snacks",       "Nuts",        "Happilo",     180.00,110.00,180, 15, "Snacks Aisle"),
    ("P020", "Dark Chocolate 70% 100g",  "Snacks",       "Chocolate",   "Amano",        95.00, 58.00,365, 15, "Snacks Aisle"),
    ("P021", "Popcorn Caramel 100g",     "Snacks",       "Popcorn",     "Act II",       45.00, 27.00,180, 25, "Snacks Aisle"),
    ("P022", "Rice Crackers 150g",       "Snacks",       "Crackers",    "Bingo",        55.00, 33.00,180, 20, "Snacks Aisle"),
    ("P023", "Roasted Peanuts 200g",     "Snacks",       "Nuts",        "Farmley",      75.00, 46.00,270, 20, "Snacks Aisle"),

    # Produce / Fresh
    ("P024", "Bananas 6pk",              "Produce",      "Fruit",       "Local",        40.00, 22.00,  5,  20, "Produce"),
    ("P025", "Baby Spinach 150g",        "Produce",      "Leafy Green", "Local",        45.00, 25.00,  4,  15, "Produce"),
    ("P026", "Cherry Tomatoes 250g",     "Produce",      "Vegetables",  "Local",        60.00, 35.00,  5,  15, "Produce"),
    ("P027", "Avocado",                  "Produce",      "Fruit",       "Local",        55.00, 32.00,  4,  20, "Produce"),

    # Personal Care
    ("P028", "Hand Cream 50ml",          "Personal Care","Skincare",    "Vaseline",     95.00, 58.00,730, 15, "Personal Care"),
    ("P029", "Lip Balm SPF15",           "Personal Care","Lip Care",    "Carmex",       65.00, 38.00,730, 20, "Personal Care"),
    ("P030", "Travel Shampoo 100ml",     "Personal Care","Hair Care",   "Dove",         75.00, 46.00,730, 15, "Personal Care"),

    # Household
    ("P031", "Dish Soap 500ml",          "Household",    "Cleaning",    "Vim",          85.00, 52.00,730, 15, "Household"),
    ("P032", "Paper Towels 2pk",         "Household",    "Paper",       "Bounty",       75.00, 46.00,None, 15, "Household"),
    ("P033", "Zip-lock Bags 30pk",       "Household",    "Storage",     "Ziploc",       95.00, 58.00,None, 10, "Household"),

    # Seasonal
    ("P034", "Wool Winter Scarf",        "Seasonal",     "Winter Wear", "Fabindia",    499.00,200.00,None,  5, "Seasonal"),
    ("P035", "Sunscreen SPF50 100ml",    "Seasonal",     "Summer Care", "Neutrogena",  395.00,180.00,730,  8, "Seasonal"),
    ("P036", "Hand Sanitizer 200ml",     "Seasonal",     "Hygiene",     "Dettol",       95.00, 52.00,730, 10, "Personal Care"),
    ("P037", "Vitamin C Supplements 30s","Seasonal",     "Health",      "Himalaya",    195.00, 95.00,730, 10, "Personal Care"),
]

# ── Helper functions ─────────────────────────────────────────────────────────

PAYMENT_METHODS = ["Cash", "Card", "UPI", "Wallet"]
PAYMENT_WEIGHTS = [0.30, 0.25, 0.38, 0.07]

CATEGORY_BASE_DEMAND = {
    "Dairy": 9, "Bakery": 7, "Beverages": 12, "Snacks": 6,
    "Produce": 8, "Personal Care": 3, "Household": 2, "Seasonal": 2,
}

# Traffic distribution across hours (weight per hour 6am-10pm)
HOUR_WEIGHTS = {
    6: 1, 7: 3, 8: 5, 9: 4, 10: 3, 11: 3,
    12: 5, 13: 6, 14: 4, 15: 3, 16: 3, 17: 5,
    18: 7, 19: 8, 20: 6, 21: 4, 22: 2,
}

def random_sale_time(sale_date: date) -> datetime:
    hour = random.choices(list(HOUR_WEIGHTS.keys()), weights=list(HOUR_WEIGHTS.values()))[0]
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    return datetime(sale_date.year, sale_date.month, sale_date.day, hour, minute, second)


def product_daily_demand(product: tuple, sale_date: date) -> int:
    pid, name, category, sub_cat, brand, price, cost, shelf, reorder, section = product
    base = CATEGORY_BASE_DEMAND.get(category, 3)
    is_weekend = sale_date.weekday() >= 5
    month = sale_date.month

    # Weekend boost
    if is_weekend:
        base = int(base * 1.5)

    # Seasonal logic
    if category == "Seasonal":
        if "Winter" in name and month in [11, 12, 1, 2]:
            base = 4
        elif "Summer" in name or "Sunscreen" in name and month in [3, 4, 5]:
            base = 5
        elif "Vitamin" in name or "Sanitizer" in name:
            base = 3
        else:
            base = 1

    # Beverages grow over time (trend)
    if category == "Beverages":
        day_num = (sale_date - date(2026, 1, 1)).days
        base += day_num // 45

    # Low-margin produce moves quickly
    if category == "Produce":
        base = int(base * 1.2)

    # Some products are niche slow movers
    if sub_cat in ["Lip Care", "Storage", "Winter Wear"]:
        base = max(1, base // 3)

    return max(0, round(random.gauss(base, base * 0.4)))


def apply_discount(category: str, sale_date: date, qty: int) -> float:
    """Return discount % (0-30)."""
    month = sale_date.month
    # End-of-month small discounts
    if sale_date.day >= 28:
        return round(random.uniform(0, 10), 1)
    # Weekend promos
    if sale_date.weekday() >= 5 and category in ["Snacks", "Beverages"]:
        return round(random.uniform(0, 15), 1)
    # Bulk discount
    if qty >= 3 and random.random() < 0.3:
        return round(random.uniform(5, 20), 1)
    # No discount
    if random.random() < 0.6:
        return 0.0
    return round(random.uniform(0, 10), 1)


# ── Generate POS sales data ──────────────────────────────────────────────────

START_DATE = date(2026, 1, 1)
END_DATE   = date(2026, 3, 31)   # 90 days

sales_rows = []

current = START_DATE
while current <= END_DATE:
    # Group sales into ~40-120 transactions per day
    num_transactions = random.randint(40, 120) if current.weekday() < 5 else random.randint(70, 150)
    transaction_ids = [str(uuid.uuid4())[:8].upper() for _ in range(num_transactions)]

    for txn_id in transaction_ids:
        sale_time = random_sale_time(current)
        payment   = random.choices(PAYMENT_METHODS, weights=PAYMENT_WEIGHTS)[0]
        # Each transaction has 1-5 line items
        num_items = random.choices([1, 2, 3, 4, 5], weights=[35, 30, 20, 10, 5])[0]
        chosen_products = random.sample(PRODUCTS, k=min(num_items, len(PRODUCTS)))

        for product in chosen_products:
            pid, name, category, sub_cat, brand, price, cost, shelf, reorder, section = product
            qty = max(1, product_daily_demand(product, current) // max(num_transactions // 10, 1))
            qty = max(1, qty)
            discount_pct = apply_discount(category, current, qty)
            discount_amt = round(price * qty * discount_pct / 100, 2)
            line_total   = round(price * qty - discount_amt, 2)
            profit       = round((price - cost) * qty - discount_amt, 2)

            sales_rows.append({
                "transaction_id":  txn_id,
                "date":            current.strftime("%Y-%m-%d"),
                "time":            sale_time.strftime("%H:%M:%S"),
                "day_of_week":     current.strftime("%A"),
                "is_weekend":      "Yes" if current.weekday() >= 5 else "No",
                "product_id":      pid,
                "product_name":    name,
                "category":        category,
                "sub_category":    sub_cat,
                "brand":           brand,
                "store_section":   section,
                "quantity":        qty,
                "unit_price":      price,
                "unit_cost":       cost,
                "discount_pct":    discount_pct,
                "discount_amount": discount_amt,
                "line_total":      line_total,
                "gross_profit":    profit,
                "payment_method":  payment,
            })

    current += timedelta(days=1)

# Sort by date + time
sales_rows.sort(key=lambda r: (r["date"], r["time"]))

sales_path = os.path.join(OUTPUT_DIR, "pos_sales.csv")
with open(sales_path, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=sales_rows[0].keys())
    writer.writeheader()
    writer.writerows(sales_rows)

print(f"pos_sales.csv  → {len(sales_rows):,} rows")


# ── Generate inventory snapshot ──────────────────────────────────────────────

SNAPSHOT_DATE = date(2026, 4, 4)   # "today"

inventory_rows = []
for product in PRODUCTS:
    pid, name, category, sub_cat, brand, price, cost, shelf, reorder, section = product

    # Estimate current stock based on base demand and randomness
    base = CATEGORY_BASE_DEMAND.get(category, 3)
    current_stock = random.randint(max(1, reorder - 5), reorder * 5)

    # Deliberately put a few products in low-stock / expiry-alert territory
    if pid in ["P007", "P025", "P013"]:   # bread, spinach, OJ → nearly expired
        current_stock = random.randint(3, 12)

    if pid in ["P032", "P010", "P023"]:   # slow movers → overstock
        current_stock = random.randint(80, 150)

    # Expiry date
    if shelf is not None:
        days_remaining = random.randint(1, shelf)
        expiry_date = SNAPSHOT_DATE + timedelta(days=days_remaining)
        # Force some items close to expiry for demo alerts
        if pid in ["P007", "P011", "P013", "P025", "P016"]:
            days_remaining = random.randint(1, 5)
            expiry_date = SNAPSHOT_DATE + timedelta(days=days_remaining)
    else:
        days_remaining = None
        expiry_date    = None

    last_restock = SNAPSHOT_DATE - timedelta(days=random.randint(1, 14))
    supplier_lead = random.randint(1, 7)

    inventory_rows.append({
        "product_id":          pid,
        "product_name":        name,
        "category":            category,
        "sub_category":        sub_cat,
        "brand":               brand,
        "store_section":       section,
        "unit_price":          price,
        "unit_cost":           cost,
        "current_stock":       current_stock,
        "reorder_point":       reorder,
        "supplier_lead_days":  supplier_lead,
        "shelf_life_days":     shelf if shelf is not None else "N/A",
        "expiry_date":         expiry_date.strftime("%Y-%m-%d") if expiry_date else "N/A",
        "days_to_expiry":      days_remaining if days_remaining is not None else "N/A",
        "last_restock_date":   last_restock.strftime("%Y-%m-%d"),
        "stock_value":         round(current_stock * cost, 2),
        "potential_revenue":   round(current_stock * price, 2),
    })

inventory_path = os.path.join(OUTPUT_DIR, "inventory.csv")
with open(inventory_path, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=inventory_rows[0].keys())
    writer.writeheader()
    writer.writerows(inventory_rows)

print(f"inventory.csv  → {len(inventory_rows):,} rows")
print(f"\nFiles saved to: {OUTPUT_DIR}/")
print("\nSample POS columns:")
print(" ", ", ".join(sales_rows[0].keys()))
print("\nSample inventory columns:")
print(" ", ", ".join(inventory_rows[0].keys()))
