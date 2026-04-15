import pandas as pd
import numpy as np
import polars as pl
from datetime import datetime, timedelta, date
import os

from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

# ── In-memory store (pandas DataFrames for load compatibility) ────────────────
_sales_data: pd.DataFrame | None = None
_inventory_data: pd.DataFrame | None = None

_DATA_DIR           = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data")
_REAL_SALES_CSV     = os.path.join(_DATA_DIR, "pos_sales.csv")
_REAL_INVENTORY_CSV = os.path.join(_DATA_DIR, "inventory.csv")


# ── Startup loader ────────────────────────────────────────────────────────────
def _try_load_real_data():
    global _sales_data, _inventory_data
    if os.path.exists(_REAL_SALES_CSV):
        try:
            _sales_data = pd.read_csv(_REAL_SALES_CSV)
            print(f"[sales_service] Loaded {len(_sales_data):,} rows from {_REAL_SALES_CSV}")
        except Exception as e:
            print(f"[sales_service] Could not load {_REAL_SALES_CSV}: {e}")
    if os.path.exists(_REAL_INVENTORY_CSV):
        try:
            _inventory_data = pd.read_csv(_REAL_INVENTORY_CSV)
            print(f"[sales_service] Loaded {len(_inventory_data):,} rows from {_REAL_INVENTORY_CSV}")
        except Exception as e:
            print(f"[sales_service] Could not load {_REAL_INVENTORY_CSV}: {e}")


_try_load_real_data()


# ── Normalisation helpers ─────────────────────────────────────────────────────
def _normalize_sales_df(df: pl.DataFrame) -> pl.DataFrame:
    """Rename raw CSV columns and cast dtypes to internal standard."""
    # Rename raw CSV columns → internal names
    rename_map: dict[str, str] = {}
    if "line_total" in df.columns and "revenue" not in df.columns:
        rename_map["line_total"] = "revenue"
    if "gross_profit" in df.columns and "profit" not in df.columns:
        rename_map["gross_profit"] = "profit"
    if rename_map:
        df = df.rename(rename_map)

    # Cast date — version-safe: cast to String first, then parse
    # Works regardless of whether the column arrives as Utf8/String/object
    if "date" in df.columns and df["date"].dtype != pl.Date:
        try:
            df = df.with_columns(
                pl.col("date").cast(pl.String).str.to_date(format="%Y-%m-%d", strict=False).alias("date")
            )
        except Exception:
            try:
                df = df.with_columns(pl.col("date").cast(pl.Date, strict=False))
            except Exception:
                pass

    # Cast and fill numeric columns
    for col in ["quantity", "revenue", "profit"]:
        if col in df.columns:
            df = df.with_columns(
                pl.col(col).cast(pl.Float64, strict=False).fill_null(0.0)
            )

    # Derive profit from cost if still absent (handles synthetic data that has a cost col)
    if "profit" not in df.columns:
        if "revenue" in df.columns and "cost" in df.columns:
            df = df.with_columns(
                (pl.col("revenue") - pl.col("cost").cast(pl.Float64, strict=False)).alias("profit")
            )
        else:
            df = df.with_columns(pl.lit(0.0).alias("profit"))

    return df


def _normalize_inventory_df(df: pl.DataFrame) -> pl.DataFrame:
    """Cast inventory numeric columns.
    days_to_expiry is intentionally kept nullable — null means non-perishable.
    """
    for col in ["current_stock", "reorder_point", "supplier_lead_days", "unit_cost", "stock_value"]:
        if col in df.columns:
            df = df.with_columns(
                pl.col(col).cast(pl.Float64, strict=False).fill_null(0.0)
            )
    if "days_to_expiry" in df.columns:
        df = df.with_columns(
            pl.col("days_to_expiry").cast(pl.Float64, strict=False)  # nulls preserved
        )
    return df


# ── JSON-safe serialisation ───────────────────────────────────────────────────
def _safe_pl_records(df: pl.DataFrame) -> list[dict]:
    """Convert a Polars DataFrame to a JSON-serialisable list of dicts.
    - date  → ISO string
    - inf / nan floats → None
    Polars .to_dicts() already returns Python native types; nulls come as None.
    """
    records = []
    for row in df.to_dicts():
        clean: dict = {}
        for k, v in row.items():
            if isinstance(v, date):
                clean[k] = v.isoformat()
            elif isinstance(v, float) and not np.isfinite(v):
                clean[k] = None
            else:
                clean[k] = v
        records.append(clean)
    return records


def _empty_sales_response() -> dict:
    return {
        "total_revenue": 0.0,
        "total_items_sold": 0,
        "total_profit": 0.0,
        "avg_order_value": 0.0,
        "growth_pct": 0.0,
        "trend_direction": "stable",
        "peak_day": None,
        "worst_day": None,
        "top_products": [],
        "slow_movers": [],
        "categories": [],
        "underperforming_products": [],
        "underperforming_products_ml": [],
        "anomalies": [],
        "forecast_7d": [],
        "product_clusters": [],
        "trends": [],
    }


def _empty_inventory_response() -> dict:
    return {
        "total_products": 0,
        "total_inventory_value": 0.0,
        "low_stock": [],
        "expiring_soon": [],
        "overstock": [],
        "stockout_risk": [],
        "slow_moving_inventory": [],
        "dead_stock": [],
        "all_items": [],
    }


# ── Sample data generation (kept in pandas for compatibility) ─────────────────
def generate_sample_data():
    """Generate realistic sample sales and inventory data for a small retail store."""
    global _sales_data, _inventory_data
    np.random.seed(42)

    products = [
        {"id": "P001", "name": "Whole Milk 1L",           "category": "Dairy",     "price": 3.49,  "cost": 2.10},
        {"id": "P002", "name": "Sourdough Bread",           "category": "Bakery",    "price": 4.99,  "cost": 2.50},
        {"id": "P003", "name": "Organic Eggs (12pk)",       "category": "Dairy",     "price": 5.99,  "cost": 3.50},
        {"id": "P004", "name": "Archi POP's Chips (4pk)",   "category": "Snacks",    "price": 6.49,  "cost": 3.20},
        {"id": "P005", "name": "Cold Brew Coffee",           "category": "Beverages", "price": 4.29,  "cost": 1.80},
        {"id": "P006", "name": "Greek Yogurt 500g",          "category": "Dairy",     "price": 3.99,  "cost": 2.20},
        {"id": "P007", "name": "Sparkling Water (6pk)",      "category": "Beverages", "price": 5.49,  "cost": 2.80},
        {"id": "P008", "name": "Dark Chocolate Bar",         "category": "Snacks",    "price": 3.29,  "cost": 1.50},
        {"id": "P009", "name": "Fresh Orange Juice 1L",      "category": "Beverages", "price": 4.79,  "cost": 2.60},
        {"id": "P010", "name": "Winter Scarf (Wool)",        "category": "Seasonal",  "price": 19.99, "cost": 8.00},
        {"id": "P011", "name": "Summer Hat (Straw)",          "category": "Seasonal",  "price": 14.99, "cost": 5.50},
        {"id": "P012", "name": "Trail Mix 250g",              "category": "Snacks",    "price": 4.49,  "cost": 2.30},
        {"id": "P013", "name": "Almond Milk 1L",              "category": "Dairy",     "price": 3.99,  "cost": 2.40},
        {"id": "P014", "name": "Croissants (4pk)",            "category": "Bakery",    "price": 5.49,  "cost": 2.80},
        {"id": "P015", "name": "Energy Drink Can",            "category": "Beverages", "price": 2.99,  "cost": 1.20},
    ]

    sales_records = []
    base_date = datetime(2026, 1, 1)
    for day in range(90):
        dt = base_date + timedelta(days=day)
        is_weekend = dt.weekday() >= 5
        for product in products:
            base_demand = {
                "Dairy": 8, "Bakery": 6, "Snacks": 4, "Beverages": 10, "Seasonal": 2,
            }[product["category"]]
            if is_weekend:
                base_demand = int(base_demand * 1.4)
            if product["category"] == "Seasonal":
                if "Winter" in product["name"] and dt.month <= 2:
                    base_demand = 5
                elif "Summer" in product["name"] and dt.month >= 3:
                    base_demand = 4
                else:
                    base_demand = 1
            if product["category"] == "Beverages":
                base_demand += day // 30
            qty = max(0, np.random.poisson(base_demand))
            if qty > 0:
                sales_records.append({
                    "date":         dt.strftime("%Y-%m-%d"),
                    "product_id":   product["id"],
                    "product_name": product["name"],
                    "category":     product["category"],
                    "quantity":     qty,
                    "unit_price":   product["price"],
                    "revenue":      round(qty * product["price"], 2),
                    "cost":         round(qty * product["cost"], 2),
                })
    _sales_data = pd.DataFrame(sales_records)

    inventory_records = []
    for product in products:
        stock = np.random.randint(5, 100)
        days_to_expiry = None
        if product["category"] in ["Dairy", "Bakery", "Beverages"]:
            days_to_expiry = np.random.randint(1, 30)
        inventory_records.append({
            "product_id":         product["id"],
            "product_name":       product["name"],
            "category":           product["category"],
            "current_stock":      stock,
            "unit_price":         product["price"],
            "unit_cost":          product["cost"],
            "days_to_expiry":     days_to_expiry,
            "reorder_point":      15,
            "supplier_lead_days": np.random.randint(2, 7),
        })
    _inventory_data = pd.DataFrame(inventory_records)

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


# ── Sales Summary ─────────────────────────────────────────────────────────────
def get_sales_summary() -> dict:
    if _sales_data is None:
        generate_sample_data()

    try:
        pl_df = pl.from_pandas(_sales_data)
    except Exception:
        return _empty_sales_response()

    pl_df = _normalize_sales_df(pl_df)
    if pl_df.is_empty():
        return _empty_sales_response()

    # ── Core metrics ──────────────────────────────────────────────────────────
    total_revenue    = round(float(pl_df["revenue"].sum() or 0.0), 2)
    total_items_sold = int(pl_df["quantity"].sum() or 0)
    total_profit     = round(float(pl_df["profit"].sum() or 0.0), 2)

    # ── Daily time series — must be sorted for rolling to be correct ──────────
    daily = (
        pl_df.group_by("date")
        .agg([
            pl.col("revenue").sum().alias("revenue"),
            pl.col("quantity").sum().cast(pl.Int64).alias("quantity"),
        ])
        .sort("date")
    )

    # ── 7-day rolling average + std ───────────────────────────────────────────
    daily = daily.with_columns([
        pl.col("revenue").rolling_mean(window_size=7, min_periods=1).alias("ma7"),
        pl.col("revenue").rolling_std(window_size=7, min_periods=1).fill_null(0.0).alias("std7"),
    ])

    # ── Growth: last-7d avg vs previous-7d avg ────────────────────────────────
    rev_arr = np.nan_to_num(daily["revenue"].to_numpy(), nan=0.0)
    n = len(rev_arr)
    if n >= 14:
        last7_avg = float(np.mean(rev_arr[-7:]))
        prev7_avg = float(np.mean(rev_arr[-14:-7]))
    elif n >= 8:
        last7_avg = float(np.mean(rev_arr[-7:]))
        prev7_avg = float(np.mean(rev_arr[:-7]))
    else:
        last7_avg = prev7_avg = float(np.mean(rev_arr)) if n > 0 else 0.0

    growth_pct = round(
        ((last7_avg - prev7_avg) / prev7_avg * 100) if prev7_avg != 0 else 0.0, 2
    )
    trend_direction = "up" if growth_pct > 5 else ("down" if growth_pct < -5 else "stable")

    # ── Peak / Worst day of week ──────────────────────────────────────────────
    peak_day = worst_day = None
    if "day_of_week" in pl_df.columns:
        day_perf = (
            pl_df.group_by("day_of_week")
            .agg(pl.col("revenue").sum().alias("total_revenue"))
            .sort("total_revenue", descending=True)
        )
        if len(day_perf) > 0:
            peak_day  = str(day_perf["day_of_week"][0])
            worst_day = str(day_perf["day_of_week"][-1])

    # ── Avg order value ───────────────────────────────────────────────────────
    avg_order_value = 0.0
    if "transaction_id" in pl_df.columns:
        tx_agg = (
            pl_df.group_by("transaction_id")
            .agg(pl.col("revenue").sum().alias("tx_revenue"))
        )
        avg_order_value = round(float(tx_agg["tx_revenue"].mean() or 0.0), 2)

    # ── Product analytics ─────────────────────────────────────────────────────
    prod_agg = (
        pl_df.group_by("product_name")
        .agg([
            pl.col("revenue").sum().alias("revenue"),
            # Cast to Int64 so JSON gets 42 not 42.0
            pl.col("quantity").sum().cast(pl.Int64).alias("quantity"),
        ])
    )

    # Rename product_name → name to match the original API contract
    top_products = _safe_pl_records(
        prod_agg.sort("revenue", descending=True).head(5).rename({"product_name": "name"})
    )
    slow_movers = _safe_pl_records(
        prod_agg.sort("quantity", descending=False).head(5).rename({"product_name": "name"})
    )

    # ── Category breakdown ────────────────────────────────────────────────────
    cat_agg = (
        pl_df.group_by("category")
        .agg([
            pl.col("revenue").sum().alias("revenue"),
            pl.col("quantity").sum().cast(pl.Int64).alias("quantity"),
        ])
        .sort("revenue", descending=True)
    )
    categories = _safe_pl_records(cat_agg)

    # ── Underperforming products: last-14d revenue share < 20% ───────────────
    underperforming: list[dict] = []
    if "date" in pl_df.columns:
        max_date = pl_df["date"].max()
        if max_date is not None:
            cutoff = max_date - timedelta(days=14)
            total_prod = (
                pl_df.group_by("product_name")
                .agg(pl.col("revenue").sum().alias("total_revenue"))
            )
            recent_prod = (
                pl_df.filter(pl.col("date") >= cutoff)
                .group_by("product_name")
                .agg(pl.col("revenue").sum().alias("recent_revenue"))
            )
            under_df = (
                total_prod
                .join(recent_prod, on="product_name", how="left")
                .with_columns(pl.col("recent_revenue").fill_null(0.0))
                .with_columns(
                    (pl.col("recent_revenue") / (pl.col("total_revenue") + 1e-9))
                    .alias("decline_ratio")
                )
                .filter(pl.col("decline_ratio") < 0.2)
                .select(["product_name", "total_revenue", "recent_revenue", "decline_ratio"])
            )
            underperforming = _safe_pl_records(under_df)

    trends = _safe_pl_records(daily)

    # ═════════════════════════════════════════════════════════════════════════
    # ML SECTION
    # ═════════════════════════════════════════════════════════════════════════

    # ── 3.1  Anomaly detection (IsolationForest on daily revenue) ─────────────
    anomalies: list[dict] = []
    if len(rev_arr) >= 10:
        iso = IsolationForest(contamination=0.05, random_state=42)
        preds = iso.fit_predict(rev_arr.reshape(-1, 1))
        mean_rev = float(rev_arr.mean())
        dates_list = daily["date"].to_list()
        for i, (pred, rev) in enumerate(zip(preds, rev_arr)):
            if pred == -1:
                d = dates_list[i]
                anomalies.append({
                    "date":    d.isoformat() if hasattr(d, "isoformat") else str(d),
                    "revenue": round(float(rev), 2),
                    "type":    "spike" if float(rev) > mean_rev else "drop",
                })

    # ── 3.2  Forecasting: LinearRegression → next 7 days ─────────────────────
    forecast_7d: list[dict] = []
    if len(rev_arr) >= 7:
        X_train = np.arange(len(rev_arr)).reshape(-1, 1)
        lr = LinearRegression()
        lr.fit(X_train, rev_arr)
        for i in range(1, 8):
            pred_val = float(lr.predict([[len(rev_arr) + i - 1]])[0])
            forecast_7d.append({
                "day":              i,
                "forecast_revenue": round(max(pred_val, 0.0), 2),
            })

    # ── 3.3  Product clustering: KMeans(k=3) on (quantity, revenue) ───────────
    product_clusters:            list[dict] = []
    underperforming_products_ml: list[str]  = []
    if len(prod_agg) >= 3:
        features = prod_agg.select(["quantity", "revenue"]).to_numpy().astype(float)
        features_clean = np.nan_to_num(features, nan=0.0)
        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features_clean)
        n_clusters = min(3, len(prod_agg))
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(features_scaled)

        # Cluster with lowest mean revenue = underperforming
        cluster_rev: dict[int, list[float]] = {}
        for label, rev in zip(labels, prod_agg["revenue"].to_list()):
            cluster_rev.setdefault(int(label), []).append(float(rev or 0.0))
        worst_cluster = min(cluster_rev, key=lambda c: float(np.mean(cluster_rev[c])))

        for name, label in zip(prod_agg["product_name"].to_list(), labels):
            is_under = bool(int(label) == worst_cluster)
            product_clusters.append({
                "product_name":       name,
                "cluster":            int(label),
                "is_underperforming": is_under,
            })
            if is_under:
                underperforming_products_ml.append(name)

    return {
        "total_revenue":               total_revenue,
        "total_items_sold":            total_items_sold,
        "total_profit":                total_profit,
        "avg_order_value":             avg_order_value,
        "growth_pct":                  growth_pct,
        "trend_direction":             trend_direction,
        "peak_day":                    peak_day,
        "worst_day":                   worst_day,
        "top_products":                top_products,
        "slow_movers":                 slow_movers,
        "categories":                  categories,
        "underperforming_products":    underperforming,
        "underperforming_products_ml": underperforming_products_ml,
        "anomalies":                   anomalies,
        "forecast_7d":                 forecast_7d,
        "product_clusters":            product_clusters,
        "trends":                      trends,
    }


# ── Inventory Status ──────────────────────────────────────────────────────────
def get_inventory_status() -> dict:
    if _inventory_data is None:
        generate_sample_data()

    try:
        inv_pl = pl.from_pandas(_inventory_data)
    except Exception:
        return _empty_inventory_response()

    inv_pl = _normalize_inventory_df(inv_pl)
    if inv_pl.is_empty():
        return _empty_inventory_response()

    # ── Aggregate sales by product_id to get velocity metrics ─────────────────
    # Start with inventory; sales columns will be joined on top.
    # NOTE: Polars DataFrames are immutable — .clone() does not exist.
    #       Assigning inv_pl to merged and then joining returns a new DataFrame.
    merged = inv_pl

    if _sales_data is not None and "product_id" in _sales_data.columns:
        try:
            sales_pl = pl.from_pandas(_sales_data)
            sales_pl = _normalize_sales_df(sales_pl)
            sales_agg = (
                sales_pl.group_by("product_id")
                .agg([
                    pl.col("quantity").sum().alias("total_sold"),
                    pl.col("date").n_unique().alias("unique_days"),
                ])
                .with_columns(
                    (pl.col("total_sold") / (pl.col("unique_days").cast(pl.Float64) + 1e-9))
                    .alias("daily_avg")
                )
            )
            merged = inv_pl.join(sales_agg, on="product_id", how="left")
        except Exception:
            merged = inv_pl  # leave without sales columns; handled below

    # Fill null sales columns that appear after a left join (unmatched products)
    for col in ["total_sold", "daily_avg"]:
        if col in merged.columns:
            merged = merged.with_columns(pl.col(col).fill_null(0.0))
        else:
            merged = merged.with_columns(pl.lit(0.0).alias(col))

    if "unique_days" in merged.columns:
        merged = merged.with_columns(pl.col("unique_days").fill_null(0))
    else:
        merged = merged.with_columns(pl.lit(0).alias("unique_days"))

    # ── Days of cover ─────────────────────────────────────────────────────────
    # Use 9999.0 sentinel (not inf) for zero-velocity products — stays JSON-safe
    # and correctly excluded from stockout_risk filter below.
    merged = merged.with_columns(
        pl.when(pl.col("daily_avg") > 0.0)
        .then(pl.col("current_stock") / pl.col("daily_avg"))
        .otherwise(pl.lit(9999.0))
        .alias("days_of_cover")
    )

    # ── Total inventory value ─────────────────────────────────────────────────
    if "stock_value" in merged.columns:
        total_value = round(float(merged["stock_value"].sum() or 0.0), 2)
    else:
        total_value = round(
            float((merged["current_stock"] * merged["unit_cost"]).sum() or 0.0), 2
        )

    # ── Rule-based filters ────────────────────────────────────────────────────

    low_stock = _safe_pl_records(
        merged.filter(pl.col("current_stock") <= pl.col("reorder_point"))
    )

    # Nulls (non-perishables) are automatically excluded by the > 0 guard
    if "days_to_expiry" in merged.columns:
        expiring_soon = _safe_pl_records(
            merged.filter(
                pl.col("days_to_expiry").is_not_null()
                & (pl.col("days_to_expiry") > 0)
                & (pl.col("days_to_expiry") <= 7)
            )
        )
    else:
        expiring_soon = []

    overstock = _safe_pl_records(
        merged.filter(pl.col("current_stock") > 80)
    )

    # Sentinel excluded: zero-velocity products are not a "stockout risk"
    stockout_risk = _safe_pl_records(
        merged.filter(
            (pl.col("days_of_cover") < pl.col("supplier_lead_days"))
            & (pl.col("days_of_cover") < 9999.0)
        )
    )

    # Slow moving: bottom 25th-percentile by total_sold (active products only)
    active = merged.filter(pl.col("total_sold") > 0)
    slow_moving_inventory: list[dict] = []
    if len(active) > 0:
        threshold = active["total_sold"].quantile(0.25)
        if threshold is not None:
            slow_moving_inventory = _safe_pl_records(
                active.filter(pl.col("total_sold") <= threshold)
            )

    # Dead stock: never sold a single unit
    dead_stock = _safe_pl_records(
        merged.filter(pl.col("total_sold") == 0.0)
    )

    return {
        "total_products":         len(merged),
        "total_inventory_value":  total_value,
        "low_stock":              low_stock,
        "expiring_soon":          expiring_soon,
        "overstock":              overstock,
        "stockout_risk":          stockout_risk,
        "slow_moving_inventory":  slow_moving_inventory,
        "dead_stock":             dead_stock,
        "all_items":              _safe_pl_records(merged),
    }


# ── Context for AI Advisor ────────────────────────────────────────────────────
def get_context_for_advisor() -> str:
    """Return a rich text summary of sales + inventory for the LangGraph advisor."""
    sales     = get_sales_summary()
    inventory = get_inventory_status()

    lines = [
        "=== SALES SUMMARY (Last 90 Days) ===",
        f"Total Revenue:    ${sales['total_revenue']:,.2f}",
        f"Total Items Sold: {sales['total_items_sold']:,}",
        f"Total Profit:     ${sales['total_profit']:,.2f}",
        f"Avg Order Value:  ${sales['avg_order_value']:,.2f}",
        f"Revenue Growth:   {sales['growth_pct']}% ({sales['trend_direction']})",
        f"Peak Day:         {sales['peak_day']}",
        f"Worst Day:        {sales['worst_day']}",
        "",
        "Top 5 Products by Revenue:",
    ]
    for p in sales["top_products"]:
        lines.append(
            f"  - {p.get('name', p.get('product_name', '?'))}: "
            f"${p['revenue']:,.2f} ({p['quantity']} units)"
        )

    lines.append("\nSlowest Moving Products:")
    for p in sales["slow_movers"]:
        lines.append(
            f"  - {p.get('name', p.get('product_name', '?'))}: "
            f"${p['revenue']:,.2f} ({p['quantity']} units)"
        )

    lines.append("\nCategory Breakdown:")
    for c in sales["categories"]:
        lines.append(f"  - {c['category']}: ${c['revenue']:,.2f} ({c['quantity']} units)")

    if sales["anomalies"]:
        lines.append(f"\nRevenue Anomalies Detected: {len(sales['anomalies'])}")
        for a in sales["anomalies"][:3]:
            lines.append(f"  - {a['date']}: ${a['revenue']:,.2f} ({a['type']})")

    if sales["underperforming_products_ml"]:
        lines.append("\nML-Flagged Underperforming Products:")
        for name in sales["underperforming_products_ml"]:
            lines.append(f"  - {name}")

    if sales["forecast_7d"]:
        lines.append("\n7-Day Revenue Forecast:")
        for f in sales["forecast_7d"]:
            lines.append(f"  Day {f['day']}: ${f['forecast_revenue']:,.2f}")

    lines += [
        "",
        "=== INVENTORY STATUS ===",
        f"Total Inventory Value: ${inventory['total_inventory_value']:,.2f}",
        f"Total Products:        {inventory['total_products']}",
    ]

    if inventory["expiring_soon"]:
        lines.append("\nProducts Expiring Soon (within 7 days):")
        for item in inventory["expiring_soon"]:
            lines.append(
                f"  - {item.get('product_name', '?')}: "
                f"{item.get('current_stock')} units, "
                f"expires in {item.get('days_to_expiry')} days"
            )

    if inventory["low_stock"]:
        lines.append("\nLow Stock Alert:")
        for item in inventory["low_stock"]:
            lines.append(
                f"  - {item.get('product_name', '?')}: "
                f"{item.get('current_stock')} units "
                f"(reorder point: {item.get('reorder_point')})"
            )

    if inventory["stockout_risk"]:
        lines.append("\nStockout Risk:")
        for item in inventory["stockout_risk"]:
            doc = item.get("days_of_cover")
            doc_str = f"{doc:.1f}" if isinstance(doc, (int, float)) else "?"
            lines.append(
                f"  - {item.get('product_name', '?')}: "
                f"{doc_str} days cover vs "
                f"{item.get('supplier_lead_days')} day lead time"
            )

    if inventory["dead_stock"]:
        lines.append("\nDead Stock (zero sales):")
        for item in inventory["dead_stock"]:
            lines.append(
                f"  - {item.get('product_name', '?')}: "
                f"{item.get('current_stock')} units in stock"
            )

    return "\n".join(lines)