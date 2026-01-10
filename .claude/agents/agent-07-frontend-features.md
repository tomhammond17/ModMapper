# Agent 7: Frontend Features UI

## Mission
Build React components for Pro features: folders, document library, version control, and template editor. Update navigation and home page.

## Branch
```bash
git checkout -b feature/frontend-features develop
```

## Dependencies
- Agents 3-5 (Backend: Folders, Versions, Templates) should be merged
- Agent 6 (Frontend Auth) should be merged

---

## Tasks

### 1. Create Folder Components

**Folder Tree (`client/src/components/folders/folder-tree.tsx`):**

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Folder, FolderOpen, Plus, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface FolderType {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
}

interface FolderTreeProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
}

export function FolderTree({ selectedFolderId, onSelectFolder }: FolderTreeProps) {
  const queryClient = useQueryClient();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: folders = [] } = useQuery<FolderType[]>({
    queryKey: ['folders'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/folders');
      return res.folders;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; parentId?: string }) =>
      apiFetch('/api/v1/folders', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch(`/api/v1/folders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/folders/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFolders(newExpanded);
  };

  const handleRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const submitRename = (id: string) => {
    if (editName.trim()) {
      renameMutation.mutate({ id, name: editName.trim() });
    }
    setEditingId(null);
  };

  // Build tree structure
  const rootFolders = folders.filter(f => !f.parentId);
  const childrenMap = new Map<string, FolderType[]>();
  folders.forEach(folder => {
    if (folder.parentId) {
      const children = childrenMap.get(folder.parentId) || [];
      children.push(folder);
      childrenMap.set(folder.parentId, children);
    }
  });

  const renderFolder = (folder: FolderType, depth: number = 0) => {
    const children = childrenMap.get(folder.id) || [];
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const isEditing = editingId === folder.id;

    return (
      <div key={folder.id}>
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer hover:bg-accent ${
                isSelected ? 'bg-accent' : ''
              }`}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => onSelectFolder(folder.id)}
            >
              {children.length > 0 && (
                <button onClick={(e) => { e.stopPropagation(); toggleExpand(folder.id); }}>
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}
              {isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
              {isEditing ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => submitRename(folder.id)}
                  onKeyDown={(e) => e.key === 'Enter' && submitRename(folder.id)}
                  className="h-6 px-1 w-32"
                  autoFocus
                />
              ) : (
                <span className="text-sm">{folder.name}</span>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => createMutation.mutate({ name: 'New Folder', parentId: folder.id })}>
              <Plus className="w-4 h-4 mr-2" /> New Subfolder
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleRename(folder.id, folder.name)}>
              <Pencil className="w-4 h-4 mr-2" /> Rename
            </ContextMenuItem>
            <ContextMenuItem onClick={() => deleteMutation.mutate(folder.id)} className="text-destructive">
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {isExpanded && children.map(child => renderFolder(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {/* Root level */}
      <div
        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-accent ${
          selectedFolderId === null ? 'bg-accent' : ''
        }`}
        onClick={() => onSelectFolder(null)}
      >
        <Folder className="w-4 h-4" />
        <span className="text-sm font-medium">All Documents</span>
      </div>

      {/* Folder tree */}
      {rootFolders.map(folder => renderFolder(folder))}

      {/* New folder button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={() => createMutation.mutate({ name: 'New Folder' })}
      >
        <Plus className="w-4 h-4 mr-2" /> New Folder
      </Button>
    </div>
  );
}
```

### 2. Create Document Library Page (`client/src/pages/library.tsx`)

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProtectedRoute } from '@/components/protected-route';
import { FolderTree } from '@/components/folders/folder-tree';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileText, MoreVertical, Trash2, Download, History, FolderInput, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Link } from 'wouter';

interface Document {
  id: string;
  filename: string;
  sourceFormat: string;
  createdAt: string;
  versionNumber: number;
}

export function LibraryPage() {
  const queryClient = useQueryClient();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ['documents', selectedFolderId],
    queryFn: async () => {
      const folderId = selectedFolderId || 'root';
      const res = await apiFetch(`/api/v1/documents?folderId=${folderId}`);
      return res.documents;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  const filteredDocs = documents.filter(doc =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ProtectedRoute requirePro>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <aside className="w-64 border-r p-4 overflow-y-auto">
          <h2 className="font-semibold mb-4">Folders</h2>
          <FolderTree
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Document Library</h1>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredDocs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No documents yet</h3>
                <p className="text-muted-foreground mb-4">
                  Upload files from the home page to save them here.
                </p>
                <Button asChild>
                  <Link href="/">Go to Converter</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocs.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        {doc.filename}
                      </div>
                    </TableCell>
                    <TableCell>{doc.sourceFormat.toUpperCase()}</TableCell>
                    <TableCell>v{doc.versionNumber}</TableCell>
                    <TableCell>{new Date(doc.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/documents/${doc.id}/versions`}>
                              <History className="w-4 h-4 mr-2" /> Version History
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Download className="w-4 h-4 mr-2" /> Export
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <FolderInput className="w-4 h-4 mr-2" /> Move
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(doc.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
```

### 3. Create Version History Component (`client/src/components/versions/version-history.tsx`)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, RotateCcw, GitCompare } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Version {
  id: string;
  versionNumber: number;
  isLatestVersion: boolean;
  createdAt: string;
  registers: any[];
}

interface VersionHistoryProps {
  documentId: string;
  onCompare?: (v1: number, v2: number) => void;
}

export function VersionHistory({ documentId, onCompare }: VersionHistoryProps) {
  const queryClient = useQueryClient();

  const { data: versions = [] } = useQuery<Version[]>({
    queryKey: ['versions', documentId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/versions`);
      return res.versions;
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (versionNumber: number) =>
      apiFetch(`/api/v1/documents/${documentId}/restore/${versionNumber}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['versions', documentId] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5" />
          Version History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {versions.map((version, index) => (
            <div
              key={version.id}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold text-muted-foreground">
                  v{version.versionNumber}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {new Date(version.createdAt).toLocaleDateString()}
                    </span>
                    {version.isLatestVersion && (
                      <Badge variant="secondary">Current</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {version.registers.length} registers
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {index < versions.length - 1 && onCompare && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCompare(version.versionNumber, versions[index + 1].versionNumber)}
                  >
                    <GitCompare className="w-4 h-4 mr-1" />
                    Compare
                  </Button>
                )}
                {!version.isLatestVersion && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restoreMutation.mutate(version.versionNumber)}
                    disabled={restoreMutation.isPending}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Restore
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 4. Create Version Comparison Component (`client/src/components/versions/version-compare.tsx`)

```typescript
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, Pencil } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface CompareProps {
  documentId: string;
  version1: number;
  version2: number;
}

export function VersionCompare({ documentId, version1, version2 }: CompareProps) {
  const { data: comparison } = useQuery({
    queryKey: ['compare', documentId, version1, version2],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/v1/documents/${documentId}/versions/compare?v1=${version1}&v2=${version2}`
      );
      return res.comparison;
    },
  });

  if (!comparison) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Comparing v{version1} to v{version2}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="flex gap-4">
          <Badge variant="outline" className="text-green-600 border-green-600">
            <Plus className="w-3 h-3 mr-1" />
            {comparison.summary.addedCount} added
          </Badge>
          <Badge variant="outline" className="text-red-600 border-red-600">
            <Minus className="w-3 h-3 mr-1" />
            {comparison.summary.removedCount} removed
          </Badge>
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            <Pencil className="w-3 h-3 mr-1" />
            {comparison.summary.modifiedCount} modified
          </Badge>
        </div>

        {/* Added */}
        {comparison.added.length > 0 && (
          <div>
            <h4 className="font-medium text-green-600 mb-2">Added Registers</h4>
            <div className="space-y-1">
              {comparison.added.map((reg: any) => (
                <div key={reg.address} className="p-2 bg-green-50 dark:bg-green-950 rounded text-sm">
                  [{reg.address}] {reg.name} ({reg.datatype})
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Removed */}
        {comparison.removed.length > 0 && (
          <div>
            <h4 className="font-medium text-red-600 mb-2">Removed Registers</h4>
            <div className="space-y-1">
              {comparison.removed.map((reg: any) => (
                <div key={reg.address} className="p-2 bg-red-50 dark:bg-red-950 rounded text-sm">
                  [{reg.address}] {reg.name} ({reg.datatype})
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modified */}
        {comparison.modified.length > 0 && (
          <div>
            <h4 className="font-medium text-yellow-600 mb-2">Modified Registers</h4>
            <div className="space-y-2">
              {comparison.modified.map((mod: any) => (
                <div key={mod.address} className="p-2 bg-yellow-50 dark:bg-yellow-950 rounded text-sm">
                  <div className="font-medium">[{mod.address}] {mod.new.name}</div>
                  <div className="text-muted-foreground">
                    Changed: {mod.changes.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### 5. Create Template Editor (`client/src/pages/templates/editor.tsx`)

```typescript
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { ProtectedRoute } from '@/components/protected-route';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { apiFetch } from '@/lib/api';
import { Save, Eye } from 'lucide-react';

const AVAILABLE_FIELDS = ['address', 'name', 'datatype', 'description', 'writable'];

// Sample data for preview
const SAMPLE_REGISTERS = [
  { address: 40001, name: 'Temperature', datatype: 'FLOAT32', description: 'Current temp', writable: false },
  { address: 40003, name: 'SetPoint', datatype: 'FLOAT32', description: 'Target temp', writable: true },
];

export function TemplateEditorPage() {
  const [, params] = useRoute('/templates/:id');
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isNew = params?.id === 'new';

  const [name, setName] = useState('');
  const [format, setFormat] = useState<'csv' | 'json' | 'xml'>('csv');
  const [showFields, setShowFields] = useState<string[]>(AVAILABLE_FIELDS);
  const [fieldOrder, setFieldOrder] = useState<string[]>(AVAILABLE_FIELDS);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [csvDelimiter, setCsvDelimiter] = useState(',');
  const [csvIncludeHeader, setCsvIncludeHeader] = useState(true);
  const [jsonRootKey, setJsonRootKey] = useState('registers');
  const [jsonPrettyPrint, setJsonPrettyPrint] = useState(true);
  const [xmlRootElement, setXmlRootElement] = useState('ModbusRegisters');
  const [xmlItemElement, setXmlItemElement] = useState('Register');
  const [xmlUseAttributes, setXmlUseAttributes] = useState(false);
  const [preview, setPreview] = useState('');

  // Load existing template
  const { data: template } = useQuery({
    queryKey: ['template', params?.id],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/templates/${params?.id}`);
      return res.template;
    },
    enabled: !isNew && !!params?.id,
  });

  useEffect(() => {
    if (template) {
      setName(template.name);
      setFormat(template.format);
      if (template.config.showFields) setShowFields(template.config.showFields);
      if (template.config.fieldOrder) setFieldOrder(template.config.fieldOrder);
      if (template.config.fieldMapping) setFieldMapping(template.config.fieldMapping);
      if (template.config.csv?.delimiter) setCsvDelimiter(template.config.csv.delimiter);
      if (template.config.csv?.includeHeader !== undefined) setCsvIncludeHeader(template.config.csv.includeHeader);
      if (template.config.json?.rootKey) setJsonRootKey(template.config.json.rootKey);
      if (template.config.json?.prettyPrint !== undefined) setJsonPrettyPrint(template.config.json.prettyPrint);
      if (template.config.xml?.rootElement) setXmlRootElement(template.config.xml.rootElement);
      if (template.config.xml?.itemElement) setXmlItemElement(template.config.xml.itemElement);
      if (template.config.xml?.useAttributes !== undefined) setXmlUseAttributes(template.config.xml.useAttributes);
    }
  }, [template]);

  const buildConfig = () => ({
    showFields,
    fieldOrder,
    fieldMapping: Object.fromEntries(
      Object.entries(fieldMapping).filter(([_, v]) => v && v !== _)
    ),
    csv: format === 'csv' ? { delimiter: csvDelimiter, includeHeader: csvIncludeHeader } : undefined,
    json: format === 'json' ? { rootKey: jsonRootKey, prettyPrint: jsonPrettyPrint } : undefined,
    xml: format === 'xml' ? { rootElement: xmlRootElement, itemElement: xmlItemElement, useAttributes: xmlUseAttributes } : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const config = buildConfig();
      if (isNew) {
        return apiFetch('/api/v1/templates', {
          method: 'POST',
          body: JSON.stringify({ name, format, config }),
        });
      } else {
        return apiFetch(`/api/v1/templates/${params?.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, config }),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setLocation('/templates');
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const config = buildConfig();
      // For new templates, use a mock preview endpoint or generate client-side
      if (isNew) {
        // Simple client-side preview
        return generatePreview(SAMPLE_REGISTERS, format, config);
      }
      const res = await apiFetch(`/api/v1/templates/${params?.id}/preview`, {
        method: 'POST',
        body: JSON.stringify({ registers: SAMPLE_REGISTERS }),
      });
      return res.preview;
    },
    onSuccess: (data) => setPreview(data),
  });

  const toggleField = (field: string) => {
    setShowFields(prev =>
      prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  return (
    <ProtectedRoute requirePro>
      <div className="container max-w-4xl py-6">
        <h1 className="text-2xl font-bold mb-6">
          {isNew ? 'Create Template' : 'Edit Template'}
        </h1>

        <div className="grid gap-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Custom Template"
                />
              </div>
              <div>
                <Label>Export Format</Label>
                <Select value={format} onValueChange={(v: any) => setFormat(v)} disabled={!isNew}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="xml">XML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Field Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Field Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block">Fields to Include</Label>
                <div className="flex flex-wrap gap-4">
                  {AVAILABLE_FIELDS.map(field => (
                    <div key={field} className="flex items-center gap-2">
                      <Checkbox
                        id={`field-${field}`}
                        checked={showFields.includes(field)}
                        onCheckedChange={() => toggleField(field)}
                      />
                      <Label htmlFor={`field-${field}`}>{field}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Field Mapping (Rename)</Label>
                <div className="grid grid-cols-2 gap-4">
                  {showFields.map(field => (
                    <div key={field} className="flex items-center gap-2">
                      <span className="w-24 text-sm">{field} →</span>
                      <Input
                        value={fieldMapping[field] || ''}
                        onChange={(e) => setFieldMapping(prev => ({
                          ...prev,
                          [field]: e.target.value
                        }))}
                        placeholder={field}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Format-specific options */}
          <Card>
            <CardHeader>
              <CardTitle>Format Options</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={format}>
                <TabsList>
                  <TabsTrigger value="csv">CSV</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                  <TabsTrigger value="xml">XML</TabsTrigger>
                </TabsList>

                <TabsContent value="csv" className="space-y-4">
                  <div>
                    <Label>Delimiter</Label>
                    <Select value={csvDelimiter} onValueChange={setCsvDelimiter}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value=",">Comma (,)</SelectItem>
                        <SelectItem value=";">Semicolon (;)</SelectItem>
                        <SelectItem value="\t">Tab</SelectItem>
                        <SelectItem value="|">Pipe (|)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={csvIncludeHeader}
                      onCheckedChange={setCsvIncludeHeader}
                    />
                    <Label>Include header row</Label>
                  </div>
                </TabsContent>

                <TabsContent value="json" className="space-y-4">
                  <div>
                    <Label>Root Key</Label>
                    <Input
                      value={jsonRootKey}
                      onChange={(e) => setJsonRootKey(e.target.value)}
                      placeholder="registers"
                      className="w-48"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={jsonPrettyPrint}
                      onCheckedChange={setJsonPrettyPrint}
                    />
                    <Label>Pretty print (formatted)</Label>
                  </div>
                </TabsContent>

                <TabsContent value="xml" className="space-y-4">
                  <div>
                    <Label>Root Element</Label>
                    <Input
                      value={xmlRootElement}
                      onChange={(e) => setXmlRootElement(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <div>
                    <Label>Item Element</Label>
                    <Input
                      value={xmlItemElement}
                      onChange={(e) => setXmlItemElement(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={xmlUseAttributes}
                      onCheckedChange={setXmlUseAttributes}
                    />
                    <Label>Use attributes instead of elements</Label>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Preview</CardTitle>
              <Button variant="outline" size="sm" onClick={() => previewMutation.mutate()}>
                <Eye className="w-4 h-4 mr-2" />
                Generate Preview
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">
                {preview || 'Click "Generate Preview" to see output'}
              </pre>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => setLocation('/templates')}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!name || saveMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

// Simple client-side preview generator
function generatePreview(registers: any[], format: string, config: any): string {
  // Filter and map fields
  let processed = registers.map(reg => {
    const filtered: any = {};
    for (const field of config.showFields || Object.keys(reg)) {
      if (field in reg) {
        const newKey = config.fieldMapping?.[field] || field;
        filtered[newKey] = reg[field];
      }
    }
    return filtered;
  });

  switch (format) {
    case 'csv': {
      const fields = config.showFields || Object.keys(processed[0]);
      const headers = fields.map((f: string) => config.fieldMapping?.[f] || f);
      const delim = config.csv?.delimiter || ',';
      let csv = config.csv?.includeHeader !== false ? headers.join(delim) + '\n' : '';
      csv += processed.map(r => fields.map((f: string) => {
        const key = config.fieldMapping?.[f] || f;
        return r[key];
      }).join(delim)).join('\n');
      return csv;
    }
    case 'json': {
      const data = { [config.json?.rootKey || 'registers']: processed };
      return config.json?.prettyPrint !== false
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);
    }
    case 'xml': {
      const root = config.xml?.rootElement || 'ModbusRegisters';
      const item = config.xml?.itemElement || 'Register';
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n`;
      for (const reg of processed) {
        if (config.xml?.useAttributes) {
          xml += `  <${item}`;
          for (const [k, v] of Object.entries(reg)) {
            xml += ` ${k}="${v}"`;
          }
          xml += ` />\n`;
        } else {
          xml += `  <${item}>\n`;
          for (const [k, v] of Object.entries(reg)) {
            xml += `    <${k}>${v}</${k}>\n`;
          }
          xml += `  </${item}>\n`;
        }
      }
      xml += `</${root}>`;
      return xml;
    }
    default:
      return '';
  }
}
```

### 6. Update Navigation

Add navigation links in `client/src/components/navigation.tsx` or similar:

```typescript
import { Link } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import { UserMenu } from './user-menu';
import { FileText, Folder, Layout } from 'lucide-react';

export function Navigation() {
  const { user, isPro } = useAuth();

  return (
    <nav className="border-b">
      <div className="container flex items-center justify-between h-16">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-xl">
            ModMapper
          </Link>

          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <Layout className="w-4 h-4" />
              Converter
            </Link>

            {user && isPro && (
              <>
                <Link href="/library" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                  <Folder className="w-4 h-4" />
                  Library
                </Link>
                <Link href="/templates" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                  <FileText className="w-4 h-4" />
                  Templates
                </Link>
              </>
            )}
          </div>
        </div>

        <UserMenu />
      </div>
    </nav>
  );
}
```

---

## Testing Checklist

- [ ] Folder tree renders correctly
- [ ] Folders can be created, renamed, deleted
- [ ] Documents list filtered by folder
- [ ] Version history shows all versions
- [ ] Version comparison shows diffs
- [ ] Restore creates new version
- [ ] Template editor saves config
- [ ] Template preview works
- [ ] Navigation shows Pro features only to Pro users

---

## Files Created

| File | Description |
|------|-------------|
| `client/src/components/folders/folder-tree.tsx` | Folder hierarchy |
| `client/src/pages/library.tsx` | Document library |
| `client/src/components/versions/version-history.tsx` | Version list |
| `client/src/components/versions/version-compare.tsx` | Diff viewer |
| `client/src/pages/templates/editor.tsx` | Template config |
| `client/src/pages/templates/index.tsx` | Template list |

---

## Commit Message Template
```
feat(frontend): implement Pro features UI

- Add folder tree component with CRUD
- Add document library page
- Add version history and comparison
- Add template editor with live preview
- Update navigation for Pro features

Co-Authored-By: Claude <noreply@anthropic.com>
```
