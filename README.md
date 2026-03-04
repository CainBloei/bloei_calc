# Bloei Rekenmodule – React & FastAPI Migration

A full-stack application for calculating investment fees and long-term average costs for Bloei Vermogen, rebuilt with React (Vite) and FastAPI.

## Architecture

1. **Backend (FastAPI):** A lightweight Python REST API wrapping the core calculation engine (`domain.py` and `logic.py`).
2. **Frontend (React + Vite):** A modern SPA handling user inputs, API communication, and chart rendering with Tailwind CSS and Chart.js.

## Project Structure

```
bloei-calc-demo/
├── backend/                  # FastAPI Application
│   ├── main.py               # API endpoints
│   ├── requirements.txt      # Python dependencies
│   └── bloei_rekenmodel/     # Calculation engine
└── frontend/                 # React Application
    ├── src/                  # React components, hooks, types
    ├── package.json          # Node dependencies
    └── tailwind.config.js    # Styling configuration
```

## Setup Instructions

### 1. Backend (FastAPI)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # Windows: venv\Scripts\activate
   # macOS/Linux: source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file (optional, for CORS/config):
   ```bash
   cp .env.example .env
   ```
5. Run the development server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   The API will be available at `http://localhost:8000`. API documentation is automatically generated at `http://localhost:8000/docs`.

### 2. Frontend (React + Vite)

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install Node.js dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.development` file:
   ```bash
   echo "VITE_API_BASE_URL=http://localhost:8000" > .env.development
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
   The UI will be available at `http://localhost:5173`.

## Usage

1. Open the frontend URL in your browser.
2. Enter the starting investment amount (Startvermogen) and select a risk profile in the left sidebar.
3. Add any periodic or one-time cashflows as needed.
4. Adjust simulation parameters (Horizon, Scenarios, Seed).
5. Click **"Bereken Resultaat"** to fetch the projection from the FastAPI backend and view the interactive charts and metrics.

## Azure Deployment (GitHub → Azure)

De app ondersteunt twee deployment-paden:

### Backend (Azure App Service)

- **Workflow:** `.github/workflows/main_bloei-rekenmodule.yml`
- Deployt de Python/FastAPI backend naar Azure Web App `Bloei-rekenmodule`.
- Vereist: GitHub Secrets voor Azure login (client-id, tenant-id, subscription-id).
- **Startup command** (in Azure Portal → App Service → Configuration → General settings):  
  `uvicorn main:app --host 0.0.0.0 --port 8000`
- **FRONTEND_URL** (optioneel): Stel in als de frontend-URL voor CORS (bijv. `https://jouw-static-web-app.azurestaticapps.net`).

### Frontend (Azure Static Web Apps)

- **Workflow:** `.github/workflows/azure-static-web-apps-bloei-rekenmodule.yml`
- Deployt de React/Vite frontend naar Azure Static Web Apps.
- **Setup:** Maak een Static Web App in Azure Portal, koppel aan deze repo, en voeg `AZURE_STATIC_WEB_APPS_API_TOKEN` toe aan GitHub Secrets.
- **VITE_API_BASE_URL:** Zet in `.env.production` de productie-API-URL (bijv. `https://bloei-rekenmodule.azurewebsites.net` of `https://api.bloei-vermogen.nl`).
