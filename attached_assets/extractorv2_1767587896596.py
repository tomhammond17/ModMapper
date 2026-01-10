"""
Modbus Register Extractor Module - Enhanced Version

This module handles PDF text extraction and AI-powered parsing of Modbus register tables.
Features intelligent document analysis to find register tables buried in large PDFs.
Supports OpenAI and Anthropic APIs for intelligent table extraction.
"""

import os
import re
import json
import logging
from typing import Optional
from dataclasses import dataclass, field
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
    metadata: dict = Field(default_factory=dict)


# ============================================================================
# Document Chunk for Intelligent Processing
# ============================================================================

@dataclass
class DocumentChunk:
    """Represents a section of the document with metadata."""
    text: str
    page_number: int
    relevance_score: float = 0.0
    contains_table: bool = False
    section_title: Optional[str] = None
    table_data: list = field(default_factory=list)


# ============================================================================
# Stage 1: Intelligent Text Extraction with Structure Preservation
# ============================================================================

def extract_structured_content(file_content: bytes) -> dict:
    """
    Extract text while preserving document structure and identifying 
    potential register table locations.
    """
    structured_data = {
        "pages": [],
        "total_pages": 0,
        "document_hints": []
    }
    
    try:
        with pdfplumber.open(BytesIO(file_content)) as pdf:
            structured_data["total_pages"] = len(pdf.pages)
            logger.info(f"Processing PDF with {len(pdf.pages)} pages")
            
            for page_num, page in enumerate(pdf.pages, 1):
                page_data = {
                    "page_num": page_num,
                    "text": page.extract_text() or "",
                    "tables": [],
                    "has_register_indicators": False
                }
                
                # Extract tables with structure
                tables = page.extract_tables()
                for table_idx, table in enumerate(tables):
                    if table and len(table) > 1:
                        table_text = _table_to_text(table)
                        page_data["tables"].append({
                            "index": table_idx,
                            "rows": len(table),
                            "cols": len(table[0]) if table[0] else 0,
                            "text": table_text,
                            "raw": table
                        })
                
                # Check for register-related content
                page_data["has_register_indicators"] = _has_register_indicators(
                    page_data["text"], 
                    page_data["tables"]
                )
                
                # Extract document-level hints (addressing conventions, etc.)
                hints = _extract_document_hints(page_data["text"])
                if hints:
                    structured_data["document_hints"].extend(hints)
                
                structured_data["pages"].append(page_data)
                
    except Exception as e:
        logger.error(f"Error extracting structured content: {e}")
        raise ValueError(f"Failed to extract content from PDF: {str(e)}")
    
    return structured_data


def _table_to_text(table: list) -> str:
    """Convert table to formatted text preserving structure."""
    lines = []
    for row in table:
        if row:
            cells = [str(cell).strip() if cell else "" for cell in row]
            lines.append(" | ".join(cells))
    return "\n".join(lines)


def _has_register_indicators(text: str, tables: list) -> bool:
    """
    Check if page content suggests Modbus register documentation.
    """
    text_lower = text.lower()
    
    # Strong indicators in text
    strong_patterns = [
        r'\bmodbus\b',
        r'\bregister\s*(address|map|table|list)\b',
        r'\b40[0-9]{3,4}\b',  # Holding register format
        r'\b30[0-9]{3,4}\b',  # Input register format
        r'\bholding\s*register',
        r'\binput\s*register',
        r'\bcoil\b.*\baddress\b',
        r'\bread.?write\b',
        r'\br/?w\b',
        r'0x[0-9a-f]{2,4}\b',  # Hex addresses
        r'scaling:\s*[\d./]+',  # Scaling factors
        r'offset:\s*-?[\d.]+',  # Offset values
        r'data\s*range',  # Data range specifications
    ]
    
    for pattern in strong_patterns:
        if re.search(pattern, text_lower):
            return True
    
    # Check table headers for register-related columns
    register_headers = {
        'address', 'register', 'offset', 'name', 'datatype', 
        'type', 'data type', 'description', 'access', 'r/w', 
        'rw', 'read', 'write', 'function', 'value', 'range',
        'scaling', 'parameter', 'holding', 'sec lvl', 'ct'
    }
    
    for table_data in tables:
        if table_data["raw"] and table_data["raw"][0]:
            headers = {str(h).lower().strip() for h in table_data["raw"][0] if h}
            if len(headers & register_headers) >= 2:
                return True
    
    return False


def _extract_document_hints(text: str) -> list[str]:
    """
    Extract important document-level hints about addressing conventions,
    byte order, etc.
    """
    hints = []
    
    # Look for addressing convention hints
    addressing_patterns = [
        (r'add\s*40[,.]?000\s*to\s*(the\s*)?address', 'PDU addressing: add 40000 to addresses'),
        (r'pdu\s*addressing', 'Uses PDU addressing convention'),
        (r'addresses?\s*(are|is)\s*(in\s*)?(the\s*)?range\s*(\d+)', 'Address range specified'),
        (r'base\s*address\s*(of|is|:)?\s*(\d+)', 'Base address specified'),
        (r'(big|little)\s*endian', 'Byte order specified'),
        (r'word\s*swap', 'Word swapping mentioned'),
        (r'high\s*word\s*first|low\s*word\s*first', 'Word order specified'),
    ]
    
    text_lower = text.lower()
    for pattern, hint in addressing_patterns:
        if re.search(pattern, text_lower):
            # Extract the actual matching text for context
            match = re.search(pattern, text_lower)
            if match:
                # Get surrounding context
                start = max(0, match.start() - 50)
                end = min(len(text), match.end() + 100)
                context = text[start:end].strip()
                hints.append(f"{hint}: ...{context}...")
    
    return hints


# ============================================================================
# Stage 2: Relevance Scoring and Chunk Selection
# ============================================================================

def score_and_rank_content(structured_data: dict) -> list[DocumentChunk]:
    """
    Score each page for relevance to Modbus register extraction.
    """
    chunks = []
    
    for page in structured_data["pages"]:
        score = 0.0
        text_content = page["text"]
        
        # Base score for register indicators
        if page["has_register_indicators"]:
            score += 5.0
        
        # Score based on keyword density
        score += _calculate_keyword_density_score(text_content)
        
        # Bonus for tables with register-like structure
        table_texts = []
        for table in page["tables"]:
            table_score = _score_table_structure(table["raw"])
            score += table_score
            
            # If table looks like register map, include its text
            if table_score > 2.0:
                table_texts.append(f"\n[TABLE DATA]\n{table['text']}")
        
        # Combine page text and high-value table text
        if table_texts:
            text_content = text_content + "\n".join(table_texts)
        
        # Bonus for section titles suggesting register content
        section_title = _extract_section_title(text_content)
        if section_title:
            title_lower = section_title.lower()
            if any(kw in title_lower for kw in ['modbus', 'register', 'appendix', 'data point']):
                score += 4.0
            if 'appendix' in title_lower and any(kw in text_content.lower() for kw in ['register', 'address', 'scaling']):
                score += 6.0  # Appendix with register data is gold
        
        # Bonus for pages with hex addresses and scaling factors (typical of register tables)
        if re.search(r'0x[0-9a-f]{2,4}', text_content.lower()):
            score += 2.0
        if re.search(r'scaling:\s*[\d./]+\s*\w+/bit', text_content.lower()):
            score += 3.0
        if re.search(r'offset:\s*-?[\d.]+', text_content.lower()):
            score += 2.0
        
        chunks.append(DocumentChunk(
            text=text_content,
            page_number=page["page_num"],
            relevance_score=score,
            contains_table=len(page["tables"]) > 0,
            section_title=section_title,
            table_data=page["tables"]
        ))
    
    # Sort by relevance score (highest first)
    chunks.sort(key=lambda x: x.relevance_score, reverse=True)
    
    return chunks


def _calculate_keyword_density_score(text: str) -> float:
    """Score based on presence and density of Modbus-related keywords."""
    text_lower = text.lower()
    
    if not text_lower.strip():
        return 0.0
    
    keywords = {
        # High value keywords
        'modbus': 1.5, 'register': 1.0, 'holding': 0.8, 'coil': 0.8,
        'scaling': 1.2, 'offset': 1.0, 'data range': 1.0,
        # Medium value
        'address': 0.5, 'uint16': 0.8, 'int16': 0.8, 'uint32': 0.8, 
        'int32': 0.8, 'float32': 0.8, 'r/w': 0.7, 'read/write': 0.7,
        # Protocol-specific
        'function code': 0.6, 'fc03': 0.8, 'fc06': 0.8, 'fc16': 0.8,
        'slave': 0.4, 'master': 0.4, 'rtu': 0.5, 'tcp/ip': 0.4,
        # Industrial/equipment specific
        'parameter': 0.3, 'setpoint': 0.4, 'status': 0.3,
    }
    
    score = 0.0
    for keyword, weight in keywords.items():
        count = text_lower.count(keyword)
        score += min(count * weight, 5.0)  # Cap contribution per keyword
    
    return score


def _score_table_structure(table: list) -> float:
    """
    Score a table based on how likely it is to be a register map.
    """
    if not table or len(table) < 2:
        return 0.0
    
    score = 0.0
    headers = [str(h).lower().strip() if h else "" for h in table[0]]
    
    # Check for register-map-like headers
    header_scores = {
        'address': 2.5, 'register': 2.5, 'offset': 2.0, 'holding': 2.0,
        'name': 1.0, 'parameter': 1.5, 'description': 1.0, 'desc': 1.0,
        'type': 1.0, 'datatype': 2.0, 'data type': 2.0, 'ct': 1.0,
        'access': 1.5, 'r/w': 2.0, 'rw': 2.0, 'read/write': 2.0,
        'scaling': 2.0, 'resolution': 1.5, 'range': 1.0, 'unit': 0.8,
        'sec lvl': 1.0, 'security': 0.8,
    }
    
    for header in headers:
        for key, value in header_scores.items():
            if key in header:
                score += value
                break
    
    # Check if data rows contain address-like values
    address_pattern = re.compile(r'^(0x[0-9a-f]+|[34]0[0-9]{2,4}|[0-9]{1,5})$', re.I)
    address_like_count = 0
    
    for row in table[1:min(10, len(table))]:  # Check first 9 data rows
        if row:
            for cell in row[:3]:  # Check first 3 columns
                if cell and address_pattern.match(str(cell).strip()):
                    address_like_count += 1
                    break
    
    if address_like_count >= 3:
        score += 4.0
    elif address_like_count >= 1:
        score += 2.0
    
    # Bonus for tables with many rows (register tables are usually large)
    if len(table) > 20:
        score += 2.0
    elif len(table) > 10:
        score += 1.0
    
    return score


def _extract_section_title(text: str) -> Optional[str]:
    """Try to extract section/chapter title from page text."""
    lines = text.strip().split('\n')[:10]  # Check first 10 lines
    
    for line in lines:
        line = line.strip()
        # Look for numbered sections, appendix headers, or ALL CAPS titles
        if re.match(r'^(APPENDIX\s+[A-Z])', line, re.I):
            return line
        if re.match(r'^(\d+\.?\d*\.?\d*\s+)?[A-Z][A-Z\s]{3,50}$', line):
            return line
        if re.match(r'^(Chapter|Section|Appendix)\s+\w', line, re.I):
            return line
    
    return None


# ============================================================================
# Stage 3: Smart Context Assembly
# ============================================================================

def assemble_extraction_context(
    chunks: list[DocumentChunk],
    document_hints: list[str],
    max_tokens: int = 80000,
    chars_per_token: float = 3.5
) -> tuple[str, str]:
    """
    Assemble the most relevant content within token limits,
    prioritizing high-scoring chunks.
    
    Returns: (context_text, chunk_info_summary)
    """
    max_chars = int(max_tokens * chars_per_token)
    
    context_parts = []
    current_length = 0
    included_pages = []
    
    # Categorize chunks by relevance
    high_relevance = [c for c in chunks if c.relevance_score > 8.0]
    medium_relevance = [c for c in chunks if 3.0 < c.relevance_score <= 8.0]
    low_relevance = [c for c in chunks if c.relevance_score <= 3.0]
    
    logger.info(f"Chunk distribution: {len(high_relevance)} high, {len(medium_relevance)} medium, {len(low_relevance)} low relevance")
    
    # Add document hints first (important context)
    if document_hints:
        hints_text = "\n[DOCUMENT ADDRESSING HINTS]\n" + "\n".join(set(document_hints)[:5]) + "\n"
        context_parts.append(hints_text)
        current_length += len(hints_text)
    
    # Add high relevance chunks (these contain the actual register tables)
    for chunk in high_relevance:
        chunk_text = f"\n\n{'='*60}\nPAGE {chunk.page_number} (Relevance: HIGH - Score: {chunk.relevance_score:.1f})\n"
        if chunk.section_title:
            chunk_text += f"Section: {chunk.section_title}\n"
        chunk_text += f"{'='*60}\n{chunk.text}"
        
        if current_length + len(chunk_text) <= max_chars:
            context_parts.append(chunk_text)
            current_length += len(chunk_text)
            included_pages.append(chunk.page_number)
    
    # Add medium relevance chunks if space permits
    for chunk in medium_relevance:
        chunk_text = f"\n\n{'='*60}\nPAGE {chunk.page_number} (Relevance: MEDIUM)\n{'='*60}\n{chunk.text}"
        
        if current_length + len(chunk_text) <= max_chars * 0.85:
            context_parts.append(chunk_text)
            current_length += len(chunk_text)
            included_pages.append(chunk.page_number)
    
    # If very little high-value content, add some low relevance for context
    if len(high_relevance) < 3 and current_length < max_chars * 0.4:
        for chunk in low_relevance[:10]:
            chunk_text = f"\n\n--- PAGE {chunk.page_number} ---\n{chunk.text}"
            if current_length + len(chunk_text) <= max_chars * 0.6:
                context_parts.append(chunk_text)
                current_length += len(chunk_text)
                included_pages.append(chunk.page_number)
    
    # Create summary info
    chunk_info = f"""Document Analysis Summary:
- Total pages in document: {len(chunks)}
- High relevance pages: {len(high_relevance)} (scores > 8.0)
- Medium relevance pages: {len(medium_relevance)} (scores 3.0-8.0)  
- Low relevance pages: {len(low_relevance)} (scores < 3.0)
- Pages included in context: {sorted(included_pages)}
- Total context size: {current_length:,} characters"""
    
    logger.info(chunk_info)
    
    return "".join(context_parts), chunk_info


# ============================================================================
# Stage 4: Improved LLM Prompt
# ============================================================================

SYSTEM_PROMPT = """You are an expert Modbus protocol engineer specializing in extracting register maps from industrial equipment documentation (generators, PLCs, SCADA systems, etc.).

## YOUR TASK
Extract ALL Modbus registers from the provided document content and return them as structured JSON.

## DOCUMENT CONTEXT
The content you receive has been pre-filtered and scored for relevance. Pages marked as HIGH relevance are most likely to contain actual register tables. Pay special attention to:
- Appendix sections (often contain complete register maps)
- Tables with columns like Address, Name, Type, Description, R/W
- Scaling factors, offsets, and data ranges

## ADDRESS STANDARDIZATION RULES

### Detecting Address Format
The document may specify addressing conventions. Look for hints like "add 40,000 to addresses" or "PDU addressing".

1. **Already standardized (40xxx, 30xxx)**: Keep as-is
   - 40001-49999 = Holding Registers
   - 30001-39999 = Input Registers
   
2. **Raw register numbers (100, 101, 200, etc.)**: 
   - If document says "add 40000 for PDU addressing" → add 40000
   - Otherwise, assume these ARE the register addresses and add 40000 for standardization
   - Example: Register 100 → 40100
   
3. **Zero-based offsets (0, 1, 2...)**: Add 40001
   
4. **Hexadecimal (0x0063, 0x00C9)**: Convert to decimal, then add 40000
   - 0x0063 = 99 → 40099
   - 0x00C9 = 201 → 40201

### Data Spanning Multiple Registers
For 32-bit values (2 registers), 64-bit values (4 registers):
- Report only the STARTING address
- Note the register count in description if relevant

## DATA TYPE MAPPING
| Source Terms | Normalized Type | Register Count |
|-------------|-----------------|----------------|
| int, int16, sint16, integer, 1 reg | INT16 | 1 |
| uint, uint16, word, 1 reg | UINT16 | 1 |
| int32, sint32, long, dint, 2 reg | INT32 | 2 |
| uint32, dword, ulong, udint, 2 reg | UINT32 | 2 |
| float, float32, real, single, 2 reg | FLOAT32 | 2 |
| double, float64, lreal, 4 reg | FLOAT64 | 4 |
| string, ascii, char[] | STRING | varies |
| bool, boolean, bit | BOOL | 1 |
| coil, discrete | COIL | 1 |

## SCALING AND OFFSET HANDLING
Many industrial registers have scaling factors. Include these in the description:
- "Scaling: 0.03125 C/bit, Offset: -273 C" → description should note "Temperature in °C, scale=0.03125, offset=-273"
- "Scaling: 0.125 kPa/bit" → "Pressure in kPa, scale=0.125"

## ACCESS/WRITABLE DETECTION
| Source Terms | writable Value |
|-------------|----------------|
| R/W, RW, Read/Write, W (in R/W column) | true |
| R, RO, Read, Read Only | false |
| W, WO, Write Only | true |
| Not specified | false (default) |

## OUTPUT FORMAT
Return ONLY a valid JSON object with NO markdown formatting, NO code blocks, NO explanation text:

{
  "registers": [
    {
      "address": 40100,
      "name": "Generator_Voltage",
      "datatype": "UINT16",
      "description": "Average line-line AC RMS voltage. Scale: 1 V/bit, Range: 0-64255 V",
      "writable": false
    }
  ],
  "metadata": {
    "address_format_detected": "Raw addresses 100-2259, add 40000 for PDU",
    "total_registers_found": 150,
    "document_type": "Caterpillar EMCP 4 SCADA Manual"
  }
}

## CRITICAL INSTRUCTIONS
1. Extract EVERY register you find - industrial docs often have 100-300+ registers
2. Include scaling/offset/range info in descriptions when available
3. For state-based registers, include state definitions (e.g., "0=STOP, 1=AUTO, 2=RUN")
4. For bitfield/alarm registers, note it's a bitmask in description
5. Return ONLY the JSON object - no other text before or after
6. If no registers found, return {"registers": [], "metadata": {"error": "No registers found"}}"""


def create_extraction_prompt(context: str, chunk_info: str) -> str:
    """Create the user prompt with assembled context."""
    return f"""## DOCUMENT ANALYSIS

{chunk_info}

## EXTRACTED DOCUMENT CONTENT (Prioritized by relevance)

{context}

## INSTRUCTIONS
1. Carefully analyze ALL content above, focusing on HIGH relevance pages
2. Extract every Modbus register you can identify
3. Apply address standardization (add 40000 if using raw addresses)
4. Include scaling, offset, range, and state information in descriptions
5. Return ONLY the JSON object with registers array and metadata"""


# ============================================================================
# Stage 5: AI Client and API Calls
# ============================================================================

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


def _call_anthropic(client, system_prompt: str, user_prompt: str) -> str:
    """Make API call to Anthropic Claude."""
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=16384,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": user_prompt
            }
        ]
    )
    return message.content[0].text


def _call_openai(client, system_prompt: str, user_prompt: str) -> str:
    """Make API call to OpenAI."""
    response = client.chat.completions.create(
        model="gpt-4-turbo-preview",
        max_tokens=16384,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
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


# ============================================================================
# Stage 6: Post-Processing and Validation
# ============================================================================

def validate_and_deduplicate(registers: list[dict]) -> list[dict]:
    """
    Clean up extracted registers:
    - Remove duplicates
    - Validate addresses
    - Sort by address
    """
    seen_addresses = {}
    
    for reg in registers:
        addr = reg.get("address", 0)
        
        # Skip invalid addresses
        if not isinstance(addr, int) or addr < 0:
            continue
        
        # Handle duplicates - keep the one with more information
        if addr in seen_addresses:
            existing = seen_addresses[addr]
            # Keep entry with longer description or more complete data
            existing_score = len(existing.get("description", "")) + len(existing.get("name", ""))
            new_score = len(reg.get("description", "")) + len(reg.get("name", ""))
            if new_score > existing_score:
                seen_addresses[addr] = reg
        else:
            seen_addresses[addr] = reg
    
    # Sort by address
    cleaned = sorted(seen_addresses.values(), key=lambda x: x["address"])
    
    return cleaned


# ============================================================================
# Main Public Functions
# ============================================================================

def extract_text_from_pdf(file_content: bytes) -> str:
    """
    Legacy function - extracts raw text from PDF.
    For new code, use ai_parse_data which handles everything.
    """
    text_parts = []
    
    try:
        with pdfplumber.open(BytesIO(file_content)) as pdf:
            for page_num, page in enumerate(pdf.pages, 1):
                page_text = page.extract_text() or ""
                tables = page.extract_tables()
                
                table_text = ""
                for table in tables:
                    if table:
                        for row in table:
                            if row:
                                row_text = " | ".join(str(cell) if cell else "" for cell in row)
                                table_text += row_text + "\n"
                
                combined = f"\n--- Page {page_num} ---\n{page_text}\n"
                if table_text:
                    combined += f"\n[TABLE]\n{table_text}\n"
                
                text_parts.append(combined)
                
    except Exception as e:
        logger.error(f"Error extracting text: {e}")
        raise ValueError(f"Failed to extract text from PDF: {str(e)}")
    
    return "\n".join(text_parts)


def ai_parse_data(text_or_bytes) -> ModbusRegisterTable:
    """
    Main extraction function using intelligent document processing.
    
    Args:
        text_or_bytes: Either raw PDF bytes or pre-extracted text
        
    Returns:
        ModbusRegisterTable with validated register data
    """
    # If we received bytes, use the intelligent extraction pipeline
    if isinstance(text_or_bytes, bytes):
        logger.info("Starting intelligent PDF extraction pipeline...")
        
        # Stage 1: Extract structured content
        structured_data = extract_structured_content(text_or_bytes)
        
        # Stage 2: Score and rank pages
        chunks = score_and_rank_content(structured_data)
        
        # Stage 3: Assemble context
        context, chunk_info = assemble_extraction_context(
            chunks, 
            structured_data.get("document_hints", [])
        )
        
        # Stage 4: Create prompts
        user_prompt = create_extraction_prompt(context, chunk_info)
        
    else:
        # Legacy path: text was pre-extracted
        logger.info("Using legacy text extraction path...")
        text = text_or_bytes
        
        # Truncate if too long
        max_chars = 200000
        if len(text) > max_chars:
            logger.warning(f"Text truncated from {len(text)} to {max_chars} characters")
            text = text[:max_chars]
        
        chunk_info = f"Pre-extracted text: {len(text)} characters"
        user_prompt = create_extraction_prompt(text, chunk_info)
    
    # Get AI client
    client_type, client = _get_ai_client()
    logger.info(f"Using {client_type} API for parsing")
    
    # Make API call
    try:
        if client_type == "anthropic":
            response = _call_anthropic(client, SYSTEM_PROMPT, user_prompt)
        else:
            response = _call_openai(client, SYSTEM_PROMPT, user_prompt)
    except Exception as e:
        logger.error(f"AI API call failed: {e}")
        raise ValueError(f"AI parsing failed: {str(e)}")
    
    # Extract and validate JSON
    try:
        data = _extract_json_from_response(response)
        
        # Validate and deduplicate registers
        raw_registers = data.get("registers", [])
        cleaned_registers = validate_and_deduplicate(raw_registers)
        
        # Create validated response
        register_table = ModbusRegisterTable(
            registers=[ModbusRegister(**reg) for reg in cleaned_registers],
            metadata=data.get("metadata", {})
        )
        
        logger.info(f"Successfully extracted {len(register_table.registers)} registers")
        return register_table
        
    except Exception as e:
        logger.error(f"Failed to validate AI response: {e}")
        raise ValueError(f"Failed to parse AI response: {str(e)}")


# ============================================================================
# Utility Functions for Export
# ============================================================================

def registers_to_csv(registers: list[ModbusRegister]) -> str:
    """Convert registers to CSV format."""
    lines = ["address,name,datatype,description,writable"]
    
    for reg in registers:
        desc = reg.description.replace('"', '""')
        if ',' in desc or '"' in desc or '\n' in desc:
            desc = f'"{desc}"'
        
        name = reg.name.replace('"', '""')
        if ',' in name or '"' in name:
            name = f'"{name}"'
            
        lines.append(f"{reg.address},{name},{reg.datatype},{desc},{str(reg.writable).lower()}")
    
    return "\n".join(lines)


def registers_to_json(registers: list[ModbusRegister]) -> str:
    """Convert registers to formatted JSON string."""
    data = {
        "registers": [reg.model_dump() for reg in registers]
    }
    return json.dumps(data, indent=2)
