import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useTemplate,
  useCreateTemplate,
  useUpdateTemplate,
  usePreviewTemplate,
  type TemplateConfig,
} from "@/hooks/use-templates";
import { FieldMapping } from "./field-mapping";
import { FormatSettings } from "./format-settings";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  format: z.enum(["csv", "json", "xml"]),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

interface TemplateEditorProps {
  templateId?: string;
}

const SAMPLE_REGISTERS = [
  { address: 40001, name: "Voltage", datatype: "FLOAT32", description: "Main voltage", writable: false },
  { address: 40003, name: "Current", datatype: "FLOAT32", description: "Main current", writable: false },
  { address: 40005, name: "Power", datatype: "FLOAT32", description: "Active power", writable: false },
  { address: 40007, name: "Setpoint", datatype: "INT16", description: "Control setpoint", writable: true },
];

export function TemplateEditor({ templateId }: TemplateEditorProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditing = !!templateId && templateId !== "new";

  const { data: templateData, isLoading: isLoadingTemplate } = useTemplate(
    isEditing ? templateId : null
  );

  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const previewTemplate = usePreviewTemplate();

  const [config, setConfig] = useState<TemplateConfig>({});
  const [preview, setPreview] = useState<string>("");

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: { name: "", format: "json" },
  });

  const format = form.watch("format");

  useEffect(() => {
    if (templateData?.template) {
      form.reset({
        name: templateData.template.name,
        format: templateData.template.format,
      });
      setConfig(templateData.template.config);
    }
  }, [templateData, form]);

  useEffect(() => {
    // Generate local preview
    generatePreview();
  }, [config, format]);

  const generatePreview = () => {
    try {
      let output = "";
      const registers = SAMPLE_REGISTERS;

      if (format === "json") {
        const rootKey = config.json?.rootKey || "registers";
        const data = { [rootKey]: registers };
        output = config.json?.prettyPrint !== false
          ? JSON.stringify(data, null, 2)
          : JSON.stringify(data);
      } else if (format === "csv") {
        const delimiter = config.csv?.delimiter || ",";
        const fields = config.fieldOrder || ["address", "name", "datatype", "description", "writable"];
        const headers = config.csv?.customHeaders || fields;

        if (config.csv?.includeHeader !== false) {
          output = headers.join(delimiter) + "\n";
        }

        output += registers
          .map((reg: any) =>
            fields.map((f) => String(reg[f] ?? "")).join(delimiter)
          )
          .join("\n");
      } else if (format === "xml") {
        const rootElement = config.xml?.rootElement || "ModbusRegisters";
        const itemElement = config.xml?.itemElement || "Register";

        output = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootElement}>\n`;

        for (const reg of registers) {
          if (config.xml?.useAttributes) {
            const attrs = Object.entries(reg)
              .map(([k, v]) => `${k}="${v}"`)
              .join(" ");
            output += `  <${itemElement} ${attrs} />\n`;
          } else {
            output += `  <${itemElement}>\n`;
            for (const [k, v] of Object.entries(reg)) {
              output += `    <${k}>${v}</${k}>\n`;
            }
            output += `  </${itemElement}>\n`;
          }
        }

        output += `</${rootElement}>`;
      }

      setPreview(output);
    } catch (e) {
      setPreview("Error generating preview");
    }
  };

  const handleSubmit = async (values: TemplateFormValues) => {
    try {
      if (isEditing) {
        await updateTemplate.mutateAsync({
          id: templateId,
          name: values.name,
          config,
        });
        toast({
          title: "Template updated",
          description: "Your changes have been saved.",
        });
      } else {
        await createTemplate.mutateAsync({
          name: values.name,
          format: values.format,
          config,
        });
        toast({
          title: "Template created",
          description: `"${values.name}" has been created.`,
        });
      }
      setLocation("/templates");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save template",
        variant: "destructive",
      });
    }
  };

  const isPending = createTemplate.isPending || updateTemplate.isPending;

  if (isEditing && isLoadingTemplate) {
    return (
      <div className="container max-w-6xl mx-auto p-6">
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          {isEditing ? "Edit Template" : "Create Template"}
        </h1>
        <p className="text-muted-foreground">
          Configure how your Modbus data will be exported.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Name</FormLabel>
                      <FormControl>
                        <Input placeholder="My Export Template" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="format"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Output Format</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isEditing}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select format" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="csv">CSV</SelectItem>
                          <SelectItem value="json">JSON</SelectItem>
                          <SelectItem value="xml">XML</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Tabs defaultValue="fields">
                  <TabsList className="w-full">
                    <TabsTrigger value="fields" className="flex-1">
                      Field Mapping
                    </TabsTrigger>
                    <TabsTrigger value="format" className="flex-1">
                      Format Options
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="fields" className="mt-4">
                    <FieldMapping config={config} onChange={setConfig} />
                  </TabsContent>
                  <TabsContent value="format" className="mt-4">
                    <FormatSettings
                      format={format}
                      config={config}
                      onChange={setConfig}
                    />
                  </TabsContent>
                </Tabs>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" disabled={isPending}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEditing ? "Save Changes" : "Create Template"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation("/templates")}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] rounded-md border bg-muted/50 p-4">
              <pre className="text-xs font-mono whitespace-pre-wrap">{preview}</pre>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
