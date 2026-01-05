import { useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function RegisterTable({
  registers,
  onUpdate,
  validationErrors = [],
  isReadOnly = false,
}: RegisterTableProps) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>("");

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-lg">Register Data</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {registers.length} register{registers.length !== 1 ? "s" : ""} loaded
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-24 text-xs font-semibold uppercase">
                  Address
                </TableHead>
                <TableHead className="w-40 text-xs font-semibold uppercase">
                  Name
                </TableHead>
                <TableHead className="w-28 text-xs font-semibold uppercase">
                  Data Type
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase">
                  Description
                </TableHead>
                <TableHead className="w-24 text-center text-xs font-semibold uppercase">
                  Writable
                </TableHead>
                {!isReadOnly && (
                  <TableHead className="w-16 text-center text-xs font-semibold uppercase">
                    Actions
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {registers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isReadOnly ? 5 : 6}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No registers loaded. Upload a file to get started.
                  </TableCell>
                </TableRow>
              ) : (
                registers.map((register, index) => (
                  <TableRow
                    key={index}
                    className="hover-elevate"
                    data-testid={`row-register-${index}`}
                  >
                    <TableCell className="py-3">
                      {renderCell(index, "address", register.address)}
                    </TableCell>
                    <TableCell className="py-3">
                      {renderCell(index, "name", register.name)}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {register.datatype}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 max-w-xs">
                      {renderCell(index, "description", register.description)}
                    </TableCell>
                    <TableCell className="py-3">
                      {renderCell(index, "writable", register.writable)}
                    </TableCell>
                    {!isReadOnly && (
                      <TableCell className="py-3 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteRow(index)}
                          data-testid={`button-delete-${index}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
