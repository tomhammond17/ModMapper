import React, { useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Trash2, Check, X, AlertCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModbusRegister, ModbusDataType, ValidationError } from "@shared/schema";
import { modbusDataTypes } from "@shared/schema";

interface RegisterTableProps {
  registers: ModbusRegister[];
  onUpdate: (registers: ModbusRegister[]) => void;
  validationErrors?: ValidationError[];
  isReadOnly?: boolean;
}

interface EditingCell {
  rowIndex: number;
  field: keyof ModbusRegister;
}

// Threshold for enabling virtual scrolling
const VIRTUALIZATION_THRESHOLD = 100;
// Row height for virtual scrolling calculations
const ROW_HEIGHT = 52;
// Container height for virtualized table
const VIRTUAL_TABLE_HEIGHT = 500;

export function RegisterTable({
  registers,
  onUpdate,
  validationErrors = [],
  isReadOnly = false,
}: RegisterTableProps) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const parentRef = useRef<HTMLDivElement>(null);

  // Only use virtualization for large datasets
  const useVirtualization = registers.length > VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: registers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10, // Render 10 extra rows above/below viewport for smoother scrolling
  });

  const getValidationError = (rowIndex: number, field: string): string | undefined => {
    return validationErrors.find((e) => e.row === rowIndex && e.field === field)?.message;
  };

  const startEditing = (rowIndex: number, field: keyof ModbusRegister) => {
    if (isReadOnly) return;
    const value = registers[rowIndex][field];
    setEditValue(String(value));
    setEditingCell({ rowIndex, field });
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const saveEdit = () => {
    if (!editingCell) return;

    const { rowIndex, field } = editingCell;
    const newRegisters = [...registers];
    const register = { ...newRegisters[rowIndex] };

    if (field === "address") {
      const num = parseInt(editValue, 10);
      if (!isNaN(num) && num > 0) {
        register.address = num;
      }
    } else if (field === "writable") {
      register.writable = editValue === "true";
    } else if (field === "datatype") {
      register.datatype = editValue as ModbusDataType;
    } else {
      (register as Record<string, unknown>)[field] = editValue;
    }

    newRegisters[rowIndex] = register;
    onUpdate(newRegisters);
    cancelEditing();
  };

  const addRow = () => {
    const newRegister: ModbusRegister = {
      address: registers.length > 0 ? Math.max(...registers.map((r) => r.address)) + 1 : 40001,
      name: "",
      datatype: "UINT16",
      description: "",
      writable: false,
    };
    onUpdate([...registers, newRegister]);
  };

  const deleteRow = (index: number) => {
    const newRegisters = registers.filter((_, i) => i !== index);
    onUpdate(newRegisters);
  };

  const toggleWritable = (index: number) => {
    if (isReadOnly) return;
    const newRegisters = [...registers];
    newRegisters[index] = { ...newRegisters[index], writable: !newRegisters[index].writable };
    onUpdate(newRegisters);
  };

  const renderCell = (
    rowIndex: number,
    field: keyof ModbusRegister,
    value: unknown
  ) => {
    const isEditing =
      editingCell?.rowIndex === rowIndex && editingCell?.field === field;
    const error = getValidationError(rowIndex, field);

    if (field === "writable") {
      return (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={value as boolean}
            onCheckedChange={() => toggleWritable(rowIndex)}
            disabled={isReadOnly}
            data-testid={`checkbox-writable-${rowIndex}`}
          />
        </div>
      );
    }

    if (field === "datatype" && isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Select value={editValue} onValueChange={setEditValue}>
            <SelectTrigger className="h-8" data-testid={`select-datatype-${rowIndex}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modbusDataTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="icon" variant="ghost" onClick={saveEdit} className="h-8 w-8">
            <Check className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8">
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit();
              if (e.key === "Escape") cancelEditing();
            }}
            className="h-8 text-sm"
            autoFocus
            data-testid={`input-${field}-${rowIndex}`}
          />
          <Button size="icon" variant="ghost" onClick={saveEdit} className="h-8 w-8">
            <Check className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8">
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    const displayValue = String(value);
    const isMonospace = field === "address" || field === "datatype";

    return (
      <div
        className={`group flex items-center gap-2 ${!isReadOnly ? "cursor-pointer" : ""}`}
        onClick={() => !isReadOnly && startEditing(rowIndex, field)}
      >
        <span
          className={`${isMonospace ? "font-mono text-sm" : ""} ${
            field === "description" ? "line-clamp-2" : ""
          }`}
          data-testid={`text-${field}-${rowIndex}`}
        >
          {displayValue || <span className="text-muted-foreground italic">Empty</span>}
        </span>
        {!isReadOnly && (
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
        {error && (
          <div className="flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3 w-3" />
            <span className="text-xs">{error}</span>
          </div>
        )}
      </div>
    );
  };

  const renderRow = (register: ModbusRegister, index: number, style?: React.CSSProperties) => (
    <div
      key={index}
      className="flex border-b hover:bg-muted/50 transition-colors"
      style={style}
      data-testid={`row-register-${index}`}
    >
      <div className="w-24 px-4 py-3 flex items-center">
        {renderCell(index, "address", register.address)}
      </div>
      <div className="w-40 px-4 py-3 flex items-center">
        {renderCell(index, "name", register.name)}
      </div>
      <div className="w-28 px-4 py-3 flex items-center">
        <Badge variant="secondary" className="font-mono text-xs">
          {register.datatype}
        </Badge>
      </div>
      <div className="flex-1 px-4 py-3 flex items-center max-w-xs">
        {renderCell(index, "description", register.description)}
      </div>
      <div className="w-24 px-4 py-3 flex items-center justify-center">
        {renderCell(index, "writable", register.writable)}
      </div>
      {!isReadOnly && (
        <div className="w-16 px-4 py-3 flex items-center justify-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteRow(index)}
            data-testid={`button-delete-${index}`}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      )}
    </div>
  );

  const renderHeader = () => (
    <div className="flex bg-muted/50 border-b sticky top-0 z-10">
      <div className="w-24 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
        Address
      </div>
      <div className="w-40 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
        Name
      </div>
      <div className="w-28 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
        Data Type
      </div>
      <div className="flex-1 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
        Description
      </div>
      <div className="w-24 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground text-center">
        Writable
      </div>
      {!isReadOnly && (
        <div className="w-16 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground text-center">
          Actions
        </div>
      )}
    </div>
  );

  const renderVirtualizedTable = () => (
    <div className="overflow-x-auto">
      {renderHeader()}
      <div
        ref={parentRef}
        className="overflow-y-auto"
        style={{ height: VIRTUAL_TABLE_HEIGHT }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const register = registers[virtualRow.index];
            return renderRow(register, virtualRow.index, {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            });
          })}
        </div>
      </div>
    </div>
  );

  const renderStandardTable = () => (
    <div className="overflow-x-auto">
      {renderHeader()}
      <div>
        {registers.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground">
            No registers loaded. Upload a file to get started.
          </div>
        ) : (
          registers.map((register, index) => renderRow(register, index))
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-lg">Register Data</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {registers.length} register{registers.length !== 1 ? "s" : ""} loaded
            {useVirtualization && (
              <span className="ml-2 text-xs text-primary">(virtual scrolling enabled)</span>
            )}
          </p>
        </div>
        {!isReadOnly && (
          <Button variant="outline" size="sm" onClick={addRow} data-testid="button-add-row">
            <Plus className="h-4 w-4 mr-2" />
            Add Row
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {useVirtualization ? renderVirtualizedTable() : renderStandardTable()}
      </CardContent>
    </Card>
  );
}
