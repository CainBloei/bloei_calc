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

# Check of de app in Azure draait. Zo niet, zet lokale CORS aan voor development.
IS_AZURE = os.getenv("WEBSITE_SITE_NAME") is not None

if not IS_AZURE:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173", 
            "http://127.0.0.1:5173",
            "http://localhost:5174"
        ],
        allow_credentials=False,
        allow_methods=["*"],
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
    