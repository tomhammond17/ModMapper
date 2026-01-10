import type { ModbusRegister } from "@shared/schema";

/**
 * Sanitize CSV cell values to prevent formula injection attacks
 * Excel/LibreOffice/Google Sheets treat cells starting with =+-@\t\r as formulas
 */
export function sanitizeCSVCell(value: string | number | boolean): string {
  const str = String(value);

  // Prevent formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    return "'" + str;
  }

  // Escape quotes and wrap in quotes if contains comma or newline
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }

  return str;
}

/**
 * Convert ModbusRegister array to safe CSV format
 */
export function registersToCSV(registers: ModbusRegister[]): string {
  const header = "Address,Name,Data Type,Description,Writable\n";
  const rows = registers.map(reg => {
    return [
      reg.address,
      sanitizeCSVCell(reg.name),
      reg.datatype,
      sanitizeCSVCell(reg.description),
      reg.writable,
    ].join(',');
  });

  return header + rows.join('\n');
}

/**
 * Convert ModbusRegister array to JSON format
 */
export function registersToJSON(registers: ModbusRegister[]): string {
  return JSON.stringify({ registers }, null, 2);
}

/**
 * Convert ModbusRegister array to XML format
 */
export function registersToXML(registers: ModbusRegister[]): string {
  const escapeXML = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<registers>\n';

  for (const reg of registers) {
    xml += '  <register>\n';
    xml += `    <address>${reg.address}</address>\n`;
    xml += `    <name>${escapeXML(reg.name)}</name>\n`;
    xml += `    <datatype>${reg.datatype}</datatype>\n`;
    xml += `    <description>${escapeXML(reg.description)}</description>\n`;
    xml += `    <writable>${reg.writable}</writable>\n`;
    xml += '  </register>\n';
  }

  xml += '</registers>';
  return xml;
}
