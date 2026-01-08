"""
Modbus Manual Parser - FastAPI Application

A web application that extracts Modbus register tables from PDF technical manuals
using AI-powered parsing and provides standardized JSON/CSV output.
"""

import os
import logging
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from extractor import (
    extract_text_from_pdf,
    ai_parse_data,
    registers_to_csv,
    registers_to_json,
    ModbusRegister,
    ModbusRegisterTable
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# FastAPI App Configuration
# ============================================================================

app = FastAPI(
    title="Modbus Manual Parser",
    description="Extract and standardize Modbus register tables from PDF manuals",
    version="1.0.0"
)

# Setup templates directory
templates = Jinja2Templates(directory="templates")


# ============================================================================
# Request/Response Models
# ============================================================================

class ParseResponse(BaseModel):
    """Response model for successful parsing."""
    success: bool
    message: str
    registers: list[dict]
    csv_data: str
    json_data: str


class ErrorResponse(BaseModel):
    """Response model for errors."""
    success: bool
    message: str
    detail: Optional[str] = None


# ============================================================================
# Routes
# ============================================================================

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """
    Serve the main UI page.
    """
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/parse", response_model=ParseResponse)
async def parse_pdf(file: UploadFile = File(...)):
    """
    Parse a PDF file and extract Modbus register table.
    
    Args:
        file: Uploaded PDF file
        
    Returns:
        ParseResponse with extracted registers and download data
    """
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a PDF file."
        )
    
    # Check file size (max 50MB)
    content = await file.read()
    max_size = 50 * 1024 * 1024  # 50MB
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is 50MB."
        )
    
    logger.info(f"Processing file: {file.filename} ({len(content)} bytes)")
    
    try:
        # Step 1: Extract text from PDF
        logger.info("Extracting text from PDF...")
        extracted_text = extract_text_from_pdf(content)
        
        if not extracted_text.strip():
            raise HTTPException(
                status_code=400,
                detail="Could not extract any text from the PDF. The file may be scanned or image-based."
            )
        
        # Step 2: Use AI to parse the register table
        logger.info("Parsing register data with AI...")
        register_table = ai_parse_data(extracted_text)
        
        if not register_table.registers:
            return ParseResponse(
                success=True,
                message="No Modbus registers found in the document.",
                registers=[],
                csv_data="address,name,datatype,description,writable",
                json_data='{"registers": []}'
            )
        
        # Step 3: Prepare response data
        registers_dict = [reg.model_dump() for reg in register_table.registers]
        csv_data = registers_to_csv(register_table.registers)
        json_data = registers_to_json(register_table.registers)
        
        logger.info(f"Successfully extracted {len(registers_dict)} registers")
        
        return ParseResponse(
            success=True,
            message=f"Successfully extracted {len(registers_dict)} registers.",
            registers=registers_dict,
            csv_data=csv_data,
            json_data=json_data
        )
        
    except ValueError as e:
        logger.error(f"Parsing error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        logger.exception(f"Unexpected error processing file: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "modbus-parser"}


# ============================================================================
# Error Handlers
# ============================================================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Custom HTTP exception handler."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": "An error occurred",
            "detail": exc.detail
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """General exception handler for unexpected errors."""
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "detail": str(exc)
        }
    )


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )
