import { describe, it, expect } from "vitest";
import { parseCSV, parseJSON, parseXML } from "../parsers";

describe("parseCSV", () => {
  it("should parse a valid CSV with standard headers", () => {
    const csv = `address,name,datatype,description,writable
100,Temperature,UINT16,Current temperature,false
101,Setpoint,INT16,Target temperature,true`;

    const registers = parseCSV(csv);

    expect(registers).toHaveLength(2);
    expect(registers[0]).toEqual({
      address: 100,
      name: "Temperature",
      datatype: "UINT16",
      description: "Current temperature",
      writable: false,
    });
    expect(registers[1]).toEqual({
      address: 101,
      name: "Setpoint",
      datatype: "INT16",
      description: "Target temperature",
      writable: true,
    });
  });

  it("should normalize data types correctly", () => {
    const csv = `address,name,datatype,description,writable
100,Reg1,int,Desc,false
101,Reg2,WORD,Desc,false
102,Reg3,float,Desc,false
103,Reg4,DWORD,Desc,false
104,Reg5,boolean,Desc,false`;

    const registers = parseCSV(csv);

    expect(registers[0].datatype).toBe("INT16");
    expect(registers[1].datatype).toBe("UINT16");
    expect(registers[2].datatype).toBe("FLOAT32");
    expect(registers[3].datatype).toBe("UINT32");
    expect(registers[4].datatype).toBe("BOOL");
  });

  it("should handle various writable formats", () => {
    const csv = `address,name,datatype,description,writable
100,Reg1,UINT16,Desc,true
101,Reg2,UINT16,Desc,false
102,Reg3,UINT16,Desc,yes
103,Reg4,UINT16,Desc,rw
104,Reg5,UINT16,Desc,r/w`;

    const registers = parseCSV(csv);

    expect(registers[0].writable).toBe(true);
    expect(registers[1].writable).toBe(false);
    expect(registers[2].writable).toBe(true);
    expect(registers[3].writable).toBe(true);
    expect(registers[4].writable).toBe(true);
  });

  it("should throw error for CSV without header row", () => {
    const csv = `100,Temperature,UINT16,Desc,false`;

    expect(() => parseCSV(csv)).toThrow("CSV file must have a header row and at least one data row");
  });

  it("should throw error for CSV without address column", () => {
    const csv = `name,datatype,description,writable
Temperature,UINT16,Desc,false`;

    expect(() => parseCSV(csv)).toThrow("CSV file must have an address column");
  });
});

describe("parseJSON", () => {
  it("should parse a valid JSON array of registers", () => {
    const json = JSON.stringify([
      { address: 100, name: "Reg1", datatype: "UINT16", description: "Desc1", writable: false },
      { address: 101, name: "Reg2", datatype: "INT16", description: "Desc2", writable: true },
    ]);

    const registers = parseJSON(json);

    expect(registers).toHaveLength(2);
    expect(registers[0].address).toBe(100);
    expect(registers[1].writable).toBe(true);
  });

  it("should parse JSON with registers property", () => {
    const json = JSON.stringify({
      registers: [
        { address: 100, name: "Reg1", datatype: "UINT16", description: "Desc", writable: false },
      ],
    });

    const registers = parseJSON(json);

    expect(registers).toHaveLength(1);
    expect(registers[0].name).toBe("Reg1");
  });

  it("should throw error for invalid JSON", () => {
    expect(() => parseJSON("not valid json")).toThrow();
  });
});

describe("parseXML", () => {
  it("should parse a valid XML with register elements", () => {
    const xml = `<?xml version="1.0"?>
<registers>
  <register>
    <address>100</address>
    <name>Temperature</name>
    <datatype>UINT16</datatype>
    <description>Current temp</description>
    <writable>false</writable>
  </register>
</registers>`;

    const registers = parseXML(xml);

    expect(registers).toHaveLength(1);
    expect(registers[0]).toEqual({
      address: 100,
      name: "Temperature",
      datatype: "UINT16",
      description: "Current temp",
      writable: false,
    });
  });

  it("should return empty array for XML without register elements", () => {
    const xml = `<?xml version="1.0"?><root><data>test</data></root>`;

    const registers = parseXML(xml);
    expect(registers).toEqual([]);
  });
});
