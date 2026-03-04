import os
import sys
import logging
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from bloei_rekenmodel.domain import RekenInput
from bloei_rekenmodel.logic import bereken_kosten
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

app = FastAPI(title="Bloei Rekenmodule API")

# Configure CORS - include both localhost and 127.0.0.1 so links work either way
_DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:5177",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://127.0.0.1:5176",
    "http://127.0.0.1:5177",
]


def _get_allowed_origins() -> list[str]:
    origins = list(_DEFAULT_ORIGINS)
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url:
        for url in frontend_url.split(","):
            url = url.strip()
            # Haal een eventuele onzichtbare trailing slash weg, anders blokkeert CORS alsnog
            if url.endswith("/"):
                url = url[:-1]
            if url and url != "*":
                origins.append(url)
    return origins


_allowed_origins = _get_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Prevent stack traces and internal errors from leaking to clients."""
    logger.exception("Unhandled exception in API")
    return JSONResponse(
        status_code=500,
        content={"detail": "Er is een interne fout opgetreden. Probeer het later opnieuw."},
    )


@app.post("/calculate")
async def calculate(input_data: RekenInput):
    """
    Calculate projections based on input parameters.
    """
    result = bereken_kosten(input_data)
    return result
