"""
Modbus Register Extractor Module

This module handles PDF text extraction and AI-powered parsing of Modbus register tables.
Supports OpenAI and Anthropic APIs for intelligent table extraction.
"""

import os
import re
import json
import logging
from typing import Optional
from io import BytesIO

import pdfplumber
from pydantic import BaseModel, Field, field_validator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Pydantic Models for Data Validation
# ============================================================================

class ModbusRegister(BaseModel):
    """Represents a single Modbus register entry."""
    address: int = Field(..., description="Register address (standardized to 40xxx format)")
    name: str = Field(..., description="Register name/identifier")
    datatype: str = Field(..., description="Data type (e.g., INT16, UINT32, FLOAT32)")
    description: str = Field(..., description="Register description")
    writable: bool = Field(..., description="Whether the register is writable (R/W) or read-only (R)")

    @field_validator('address')
    @classmethod
    def validate_address(cls, v: int) -> int:
        """Ensure address is a positive integer."""
        if v < 0:
            raise ValueError("Address must be a positive integer")
        return v

    @field_validator('datatype')
    @classmethod
    def normalize_datatype(cls, v: str) -> str:
        """Normalize data type strings."""
        datatype_map = {
            'int': 'INT16',
            'int16': 'INT16',
            'sint16': 'INT16',
            'integer': 'INT16',
            'uint': 'UINT16',
            'uint16': 'UINT16',
            'word': 'UINT16',
            'int32': 'INT32',
            'sint32': 'INT32',
            'long': 'INT32',
            'uint32': 'UINT32',
            'dword': 'UINT32',
            'ulong': 'UINT32',
            'float': 'FLOAT32',
            'float32': 'FLOAT32',
            'real': 'FLOAT32',
            'single': 'FLOAT32',
            'float64': 'FLOAT64',
            'double': 'FLOAT64',
            'lreal': 'FLOAT64',
            'string': 'STRING',
            'ascii': 'STRING',
            'bool': 'BOOL',
            'boolean': 'BOOL',
            'bit': 'BOOL',
            'coil': 'COIL',
        }
        normalized = datatype_map.get(v.lower().strip(), v.upper())
        return normalized


class ModbusRegisterTable(BaseModel):
    """Represents a complete Modbus register table."""
    registers: list[ModbusRegister] = Field(default_factory=list)


# ============================================================================
# PDF Text Extraction
# ============================================================================

def extract_text_from_pdf(file_content: bytes) -> str:
    """
    Extract text from a PDF file using pdfplumber.
    
    Args:
        file_content: Raw bytes of the PDF file
        
    Returns:
        Extracted text from all pages
    """
    text_parts = []
    
    try:
        with pdfplumber.open(BytesIO(file_content)) as pdf:
            logger.info(f"Processing PDF with {len(pdf.pages)} pages")
            
            for page_num, page in enumerate(pdf.pages, 1):
                # Extract text from the page
                page_text = page.extract_text() or ""
                
                # Also try to extract tables which may contain register data
                tables = page.extract_tables()
                table_text = ""
                
                for table in tables:
                    if table:
                        for row in table:
                            if row:
                                # Filter out None values and join
                                row_text = " | ".join(str(cell) if cell else "" for cell in row)
                                table_text += row_text + "\n"
                
                # Combine page text and table text
                combined = f"\n--- Page {page_num} ---\n{page_text}\n"
                if table_text:
                    combined += f"\n[TABLE DATA]\n{table_text}\n"
                
                text_parts.append(combined)
                
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {e}")
        raise ValueError(f"Failed to extract text from PDF: {str(e)}")
    
    full_text = "\n".join(text_parts)
    logger.info(f"Extracted {len(full_text)} characters from PDF")
    
    return full_text


# ============================================================================
# AI-Powered Parsing
# ============================================================================

# System prompt for the LLM
SYSTEM_PROMPT = """You are an expert Modbus protocol engineer and technical documentation analyst.

Your task is to extract Modbus register information from technical manual text and return it as structured JSON.

## CRITICAL REQUIREMENTS:

### 1. Address Standardization
- Convert ALL addresses to the standard Modbus Holding Register format (40xxx)
- Handle these common conventions:
  * If addresses start at 0 or 1, add 40001 offset (0 → 40001, 1 → 40001)
  * If addresses are in 3xxxx format (input registers), note this in description but keep format
  * If addresses are in hex (0x0000), convert to decimal and add 40001 offset
  * If addresses already in 40xxx format, keep as-is
  * Handle 1-based vs 0-based indexing (document typically specifies)

### 2. Word Swapping Detection
- Look for mentions of "word swap", "byte order", "big endian", "little endian"
- For 32-bit values spanning 2 registers:
  * Standard: Low word first (address N), High word second (address N+1)
  * Swapped: High word first (address N), Low word second (address N+1)
- Include word order info in the description if mentioned

### 3. Data Type Normalization
Use these standard types:
- INT16: Signed 16-bit integer
- UINT16: Unsigned 16-bit integer  
- INT32: Signed 32-bit integer (2 registers)
- UINT32: Unsigned 32-bit integer (2 registers)
- FLOAT32: 32-bit floating point (2 registers)
- FLOAT64: 64-bit floating point (4 registers)
- STRING: ASCII string
- BOOL/COIL: Boolean/bit value

### 4. Writable Detection
- Look for R/W, RW, Read/Write → writable: true
- Look for R, RO, Read-Only, Read Only → writable: false
- If not specified, default to false (read-only is safer)

### 5. Output Schema
Return ONLY valid JSON matching this exact schema:
{
  "registers": [
    {
      "address": <integer - standardized 40xxx format>,
      "name": "<string - register name>",
      "datatype": "<string - normalized data type>",
      "description": "<string - full description including any notes about scaling, units, word order>",
      "writable": <boolean>
    }
  ]
}

### 6. Important Rules
- Extract ALL registers found in the document
- If a table has scaling factors or units, include in description (e.g., "Temperature in °C, scale factor 0.1")
- If register spans multiple addresses (32-bit), only list the starting address
- Preserve any enumeration values in the description
- If information is missing, make reasonable assumptions and note them
- Return empty registers array if no Modbus data found

DO NOT include any text outside the JSON object. Return ONLY the JSON."""


def _get_ai_client():
    """
    Get the appropriate AI client based on available API keys.
    Returns tuple of (client_type, client)
    """
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    
    if anthropic_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=anthropic_key)
            return ("anthropic", client)
        except ImportError:
            logger.warning("Anthropic package not installed")
    
    if openai_key:
        try:
            import openai
            client = openai.OpenAI(api_key=openai_key)
            return ("openai", client)
        except ImportError:
            logger.warning("OpenAI package not installed")
    
    raise ValueError(
        "No AI API key configured. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable."
    )


def _call_anthropic(client, text: str) -> str:
    """Make API call to Anthropic Claude."""
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Extract the Modbus register table from this technical manual text:\n\n{text}"
            }
        ]
    )
    return message.content[0].text


def _call_openai(client, text: str) -> str:
    """Make API call to OpenAI."""
    response = client.chat.completions.create(
        model="gpt-4-turbo-preview",
        max_tokens=8192,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Extract the Modbus register table from this technical manual text:\n\n{text}"
            }
        ]
    )
    return response.choices[0].message.content


def _extract_json_from_response(response: str) -> dict:
    """
    Extract JSON from AI response, handling potential markdown formatting.
    """
    # Try direct JSON parse first
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        pass
    
    # Try to find JSON in markdown code blocks
    json_patterns = [
        r'```json\s*([\s\S]*?)\s*```',
        r'```\s*([\s\S]*?)\s*```',
        r'\{[\s\S]*"registers"[\s\S]*\}'
    ]
    
    for pattern in json_patterns:
        match = re.search(pattern, response)
        if match:
            try:
                json_str = match.group(1) if '```' in pattern else match.group(0)
                return json.loads(json_str)
            except (json.JSONDecodeError, IndexError):
                continue
    
    raise ValueError("Could not extract valid JSON from AI response")


def ai_parse_data(text: str) -> ModbusRegisterTable:
    """
    Use AI to parse Modbus register data from extracted text.
    
    Args:
        text: Raw text extracted from PDF
        
    Returns:
        ModbusRegisterTable with validated register data
    """
    # Truncate text if too long (most LLMs have context limits)
    max_chars = 100000
    if len(text) > max_chars:
        logger.warning(f"Text truncated from {len(text)} to {max_chars} characters")
        text = text[:max_chars]
    
    # Get AI client
    client_type, client = _get_ai_client()
    logger.info(f"Using {client_type} API for parsing")
    
    # Make API call
    try:
        if client_type == "anthropic":
            response = _call_anthropic(client, text)
        else:
            response = _call_openai(client, text)
    except Exception as e:
        logger.error(f"AI API call failed: {e}")
        raise ValueError(f"AI parsing failed: {str(e)}")
    
    # Extract and validate JSON
    try:
        data = _extract_json_from_response(response)
        register_table = ModbusRegisterTable(**data)
        logger.info(f"Successfully extracted {len(register_table.registers)} registers")
        return register_table
    except Exception as e:
        logger.error(f"Failed to validate AI response: {e}")
        raise ValueError(f"Failed to parse AI response: {str(e)}")


# ============================================================================
# Utility Functions
# ============================================================================

def registers_to_csv(registers: list[ModbusRegister]) -> str:
    """
    Convert registers to CSV format.
    
    Args:
        registers: List of ModbusRegister objects
        
    Returns:
        CSV string with headers
    """
    lines = ["address,name,datatype,description,writable"]
    
    for reg in registers:
        # Escape description for CSV (handle commas and quotes)
        desc = reg.description.replace('"', '""')
        if ',' in desc or '"' in desc or '\n' in desc:
            desc = f'"{desc}"'
        
        name = reg.name.replace('"', '""')
        if ',' in name or '"' in name:
            name = f'"{name}"'
            
        lines.append(f"{reg.address},{name},{reg.datatype},{desc},{str(reg.writable).lower()}")
    
    return "\n".join(lines)


def registers_to_json(registers: list[ModbusRegister]) -> str:
    """
    Convert registers to formatted JSON string.
    
    Args:
        registers: List of ModbusRegister objects
        
    Returns:
        Formatted JSON string
    """
    data = {
        "registers": [reg.model_dump() for reg in registers]
    }
    return json.dumps(data, indent=2)
