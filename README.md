# Multimodal Retail Intelligence Platform

AI-powered platform for SME retail analytics, automated marketing, and decision support.

## Architecture

- **Backend**: Python/FastAPI with YOLOv8, LangGraph, OpenAI
- **Frontend**: React + Vite + Tailwind CSS + Recharts

---

## Dependencies

### System requirements

| Requirement | Minimum |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ (tested on 20.x) |
| RAM | 4 GB (8 GB recommended) |
| Disk | ~2 GB (model weights + node_modules + venv) |

> **Mac users:** Works on both Intel and Apple Silicon. On Apple Silicon (M1/M2/M3), YOLOv8 automatically uses Metal GPU acceleration (MPS), making video processing significantly faster.

---

### Backend Python packages

Install everything with one command (from inside the `backend/` directory, with the venv activated):

```bash
pip install -r requirements.txt
```

What gets installed and why:

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | 0.115 | Web framework — serves all API endpoints |
| `uvicorn` | 0.30 | ASGI server that runs FastAPI |
| `python-multipart` | 0.0.9 | Handles file uploads (floor plans, videos) |
| `opencv-python-headless` | 4.10 | Video decoding, heatmap image processing, drawing sector overlays |
| `ultralytics` | 8.2 | YOLOv8 — person detection & tracking in CCTV footage |
| `numpy` | 1.26 | Vectorised pixel math for FOV masking and Voronoi assignment |
| `scipy` | 1.14 | Gaussian blur for smoothing heatmaps |
| `pandas` | 2.2 | Sales & inventory data processing |
| `Pillow` | 10.4 | Image handling utilities |
| `langgraph` | 0.2 | Agentic AI advisor graph (gather context → respond) |
| `langchain` | 0.3 | LangChain core used by LangGraph |
| `langchain-openai` | 0.2 | OpenAI integration for LangGraph |
| `langchain-core` | 0.3 | Shared LangChain primitives |
| `openai` | 1.47 | GPT-4o-mini (captions) + DALL-E 3 (image generation) |
| `python-dotenv` | 1.0 | Loads `OPENAI_API_KEY` from `.env` file |
| `pydantic` | 2.9 | Request/response validation in FastAPI |
| `matplotlib` | 3.9 | Utility charting (used internally) |
| `seaborn` | 0.13 | Utility charting (used internally) |
| `aiofiles` | 24.1 | Async static file serving |

> **Note on YOLOv8 model weights:** The first time the CV pipeline runs, Ultralytics automatically downloads `yolov8n.pt` (~6 MB) and caches it locally. No API key required — it is fully free and open-source (AGPL-3.0 licence). All subsequent runs use the cached file and work completely offline.

---

### Frontend packages

Install everything with one command (from inside the `frontend/` directory):

```bash
npm install
```

Key packages:

| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `axios` | HTTP client for API calls |
| `recharts` | Charts (area, bar, pie) |
| `lucide-react` | Icons |
| `tailwindcss` | Utility CSS framework |
| `vite` | Dev server + bundler |

---

## Setup

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Set your OpenAI API key (needed for Marketing Generator and AI Advisor only)
cp .env.example .env
# Open .env and paste your key: OPENAI_API_KEY=sk-...

# Start the backend
python run.py
```

Backend runs at http://localhost:8000

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:5173

### 3. One-command start / stop

From the project root:

```bash
python start.py   # starts both backend and frontend
python stop.py    # kills both servers
```

### 4. Generate sample sales data

The platform ships with a script that generates 90 days of realistic POS and inventory data:

```bash
python generate_data.py
```

This creates `data/pos_sales.csv` and `data/inventory.csv` which the backend reads automatically.

---

## Demo Mode

The platform works out of the box without any real data:
- Sales & inventory data is auto-generated on first API call if no CSV files are found
- The AI Advisor and Marketing Generator require a valid OpenAI API key
- The CV heatmap pipeline requires a real video upload (see Store Analytics → Add Floor)

---

## Features

1. **Store Heatmap Analytics** — Upload a floor plan image, place cameras with adjustable FOV sectors, upload CCTV footage, and generate real customer traffic heatmaps using YOLOv8 person detection
2. **Store Analytics** — Revenue trends, category breakdown, per-zone density analysis
3. **AI Marketing Generator** — Generate platform-specific social media captions (GPT-4o-mini) + product images (DALL-E 3)
4. **Conversational AI Advisor** — Ask questions about your store performance in natural language (LangGraph agent)
5. **Inventory Insights** — Expiry alerts, low stock warnings, slow mover analysis

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/video/demo` | Synthetic demo analytics |
| POST | `/api/video/upload` | Upload CCTV video (single camera) |
| GET | `/api/sales/summary` | Sales analytics & trends |
| GET | `/api/sales/inventory` | Inventory status & alerts |
| POST | `/api/sales/generate-sample` | Generate synthetic POS data |
| POST | `/api/marketing/generate` | Generate caption + image |
| POST | `/api/advisor/chat` | Chat with AI advisor |
| POST | `/api/floorplan/session` | Create floor plan session |
| POST | `/api/floorplan/session/{id}/cameras` | Save camera layout + FOV |
| POST | `/api/floorplan/session/{id}/camera/{cam}/video` | Upload camera footage |
| POST | `/api/floorplan/session/{id}/process` | Run CV pipeline |
| GET | `/api/floorplan/session/{id}/status` | Poll processing status |
| GET | `/api/floorplan/sessions` | List all floor plans |
| DELETE | `/api/floorplan/session/{id}` | Delete floor plan + all files |
