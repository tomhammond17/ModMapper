import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { TemplateList } from "@/components/templates/template-list";
import { Plus } from "lucide-react";

export default function TemplatesPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Export Templates</h1>
          <p className="text-muted-foreground">
            Create custom templates to format your Modbus data exports.
          </p>
        </div>
        <Button onClick={() => setLocation("/templates/new")}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      <TemplateList />
    </div>
  );
}
