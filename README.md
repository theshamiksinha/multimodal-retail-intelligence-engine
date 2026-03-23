# Multimodal Retail Intelligence Platform

AI-powered platform for SME retail analytics, automated marketing, and decision support.

## Architecture

- **Backend**: Python/FastAPI with YOLOv8, LangGraph, OpenAI
- **Frontend**: React + Vite + Tailwind CSS + Recharts

## Setup

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure API key
cp .env.example .env
# Edit .env and add your OpenAI API key

# Run the backend
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

### 3. Demo Mode

The platform works out of the box with generated sample data:
- Sales & inventory data is auto-generated on first API call
- Demo heatmap is generated without needing a real CCTV video
- AI Advisor and Marketing Generator require a valid OpenAI API key

## Features

1. **Store Heatmap Analytics** - Upload CCTV video or use demo data to see customer traffic heatmaps
2. **Store Analytics** - Revenue trends, category breakdown, zone analysis
3. **AI Marketing Generator** - Generate social media captions + DALL-E images
4. **Conversational AI Assistant** - Ask questions about your store in natural language
5. **Inventory Insights** - Expiry alerts, low stock warnings, slow mover analysis

## API Endpoints

- `GET /api/video/demo` - Demo analytics data
- `POST /api/video/upload` - Upload CCTV video
- `GET /api/sales/summary` - Sales analytics
- `GET /api/sales/inventory` - Inventory status
- `POST /api/marketing/generate` - Generate marketing content
- `POST /api/advisor/chat` - Chat with AI advisor
