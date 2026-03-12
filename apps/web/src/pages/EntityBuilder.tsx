import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'wouter';
import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/hooks/use-toast';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import {
  Upload, Loader2, Check, X, Trash2, Pencil, Home, Download,
  Shapes, Folder, FilePlus, Plus, Box, Copy, ChevronDown, AlignLeft, Tags,
  Map, Code, CheckCircle2, RefreshCw, FolderOpen, ChevronLeft, Sparkles,
  Zap, ArrowRight, MoreHorizontal, GripVertical
} from 'lucide-react';

import { starterTemplates as starterTemplatesList } from '@/data/starterTemplates';
const starterTemplatesMap = Object.fromEntries(starterTemplatesList.map(t => [t.key, t]));

function createEntity(label: string, definition: string, completeness: number = 20) {
  return {
    id: Date.now() + Math.random(),
    label,
    definition,
    synonyms: [] as string[],
    positives: [] as string[],
    negatives: [] as string[],
    zones: ["Email Body", "PDF Header"],
    keywords: { must: [] as string[], nice: [] as string[], neg: [] as string[] },
    pattern: "",
    completeness,
    expanded: true,
    activeTab: "definition" as "definition" | "hints" | "validation",
  };
}

interface StoredTemplate {
  id: number;
  name: string;
  description: string;
  version: string;
  entities: any[];
  createdAt: string;
  updatedAt: string;
}

export default function EntityBuilder() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [nlInput, setNlInput] = useState("");
  const [entities, setEntities] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"entities" | "repository">("entities");
  const [projectName, setProjectName] = useState("My Template");
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [publishStatus, setPublishStatus] = useState<"idle" | "publishing" | "published" | "error">("idle");
  const [storedTemplates, setStoredTemplates] = useState<StoredTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedRepoTemplate, setSelectedRepoTemplate] = useState<StoredTemplate | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const nlInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/templates");
      if (res.ok) setStoredTemplates(await res.json());
    } catch (err) {
      console.error("Error fetching templates:", err);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const templateId = params.get('template');
    if (templateId && storedTemplates.length > 0 && !editingTemplateId) {
      const t = storedTemplates.find(st => st.id === Number(templateId));
      if (t) loadTemplateFromRepo(t);
    }
  }, [storedTemplates]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const starterKey = params.get('starter');
    if (starterKey && starterTemplatesMap[starterKey] && entities.length === 0) {
      const starter = starterTemplatesMap[starterKey];
      const starterEntities = starter.entities.map(e => ({
        ...createEntity(e.label, e.definition, 80),
        synonyms: e.synonyms,
        positives: e.positives,
        negatives: e.negatives,
        zones: e.zones,
        keywords: e.keywords,
        pattern: e.pattern,
      }));
      setEntities(starterEntities);
      setProjectName(starter.name);
      setSidebarTab("entities");
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (editingTemplateId && hasUnsavedChanges && entities.length > 0) saveChanges();
      }
      if (e.key === 'Escape' && showPublishModal) setShowPublishModal(false);
      if (e.key === 'Escape' && deleteConfirm !== null) setDeleteConfirm(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingTemplateId, hasUnsavedChanges, entities, showPublishModal, deleteConfirm]);

  const loadTemplateFromRepo = (template: StoredTemplate) => {
    const loadedEntities = template.entities.map((e: any) => ({
      ...createEntity(e.label, e.definition, 60),
      synonyms: e.synonyms || [],
      positives: e.positives || [],
      negatives: e.negatives || [],
      zones: e.zones || ["Email Body", "PDF Header"],
      keywords: e.keywords || { must: [], nice: [], neg: [] },
      pattern: e.pattern || "",
    }));
    setEntities(loadedEntities);
    setProjectName(template.name);
    setEditingTemplateId(template.id);
    setHasUnsavedChanges(false);
    setSidebarTab("entities");
    toast({ title: "Template loaded", description: `"${template.name}" with ${loadedEntities.length} entities` });
  };

  const deleteTemplateFromRepo = async (id: number) => {
    const template = storedTemplates.find(t => t.id === id);
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        setStoredTemplates(prev => prev.filter(t => t.id !== id));
        if (selectedRepoTemplate?.id === id) setSelectedRepoTemplate(null);
        if (editingTemplateId === id) { setEditingTemplateId(null); setHasUnsavedChanges(false); }
        setDeleteConfirm(null);
        toast({ title: "Template deleted", description: `"${template?.name}" removed from repository` });
      } else {
        toast({ title: "Delete failed", description: "Could not delete template", variant: "destructive" });
      }
    } catch (err) {
      console.error("Error deleting template:", err);
      toast({ title: "Delete failed", description: "Network error", variant: "destructive" });
    }
  };

  const parseNaturalLanguage = async () => {
    if (!nlInput.trim()) return;
    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate-entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: nlInput }),
      });
      if (!response.ok) throw new Error("Failed to generate");
      const data = await response.json();
      if (data.entities && data.entities.length > 0) {
        const newEntity = data.entities[0];
        setEntities(prev => [...prev, newEntity]);
        setNlInput("");
        if (editingTemplateId) setHasUnsavedChanges(true);
        toast({ title: "Entity created", description: `"${newEntity.label}" generated with AI` });
      } else {
        toast({ title: "No entity generated", description: "Try a more specific description", variant: "destructive" });
      }
    } catch (err) {
      console.error("Error generating entities:", err);
      toast({ title: "Generation failed", description: "Could not generate entity. Check your connection.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const calculateCompleteness = (ent: any) => {
    let score = 0;
    if (ent.definition.length > 10) score += 20;
    if (ent.positives.length > 0) score += 20;
    if (ent.negatives.length > 0) score += 15;
    if (ent.zones.length > 0) score += 15;
    if (ent.synonyms.length > 0) score += 15;
    if (ent.pattern.length > 0) score += 15;
    return Math.min(score, 100);
  };

  const markDirty = () => { if (editingTemplateId) setHasUnsavedChanges(true); };

  const saveChanges = async () => {
    if (!editingTemplateId || !entities.length) return;
    setIsSaving(true);
    try {
      const templateEntities = entities.map(e => ({
        label: e.label, definition: e.definition, synonyms: e.synonyms,
        positives: e.positives, negatives: e.negatives, zones: e.zones,
        keywords: e.keywords, pattern: e.pattern,
      }));
      const res = await fetch(`/api/templates/${editingTemplateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          description: `${entities.length} entities - updated ${new Date().toLocaleDateString()}`,
          version: "1.0", entities: templateEntities,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setHasUnsavedChanges(false);
      await fetchTemplates();
      toast({ title: "Changes saved", description: `"${projectName}" updated successfully` });
    } catch (err) {
      console.error("Error saving changes:", err);
      toast({ title: "Save failed", description: "Could not save changes", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const updateEntity = (id: number, field: string, value: any) => {
    if (field !== 'expanded' && field !== 'activeTab') markDirty();
    setEntities(prev => prev.map(e => {
      if (e.id === id) {
        const updated = { ...e, [field]: value };
        updated.completeness = calculateCompleteness(updated);
        return updated;
      }
      return e;
    }));
  };

  const deleteEntity = (id: number) => {
    const entity = entities.find(e => e.id === id);
    markDirty();
    setEntities(prev => prev.filter(e => e.id !== id));
    toast({ title: "Entity removed", description: `"${entity?.label}" deleted` });
  };

  const duplicateEntity = (id: number) => {
    const source = entities.find(e => e.id === id);
    if (!source) return;
    const newEntity = { ...source, id: Date.now() + Math.random(), label: source.label + "_copy", expanded: true };
    setEntities(prev => [...prev, newEntity]);
    if (editingTemplateId) setHasUnsavedChanges(true);
    toast({ title: "Entity duplicated", description: `"${source.label}" copied` });
  };

  const addNewEntity = () => {
    const newEntity = createEntity("NewEntity", "Define this entity's purpose.", 0);
    setEntities(prev => [...prev, newEntity]);
    if (editingTemplateId) setHasUnsavedChanges(true);
  };

  const addExample = (id: number, type: 'positives' | 'negatives', value: string) => {
    if (!value) return; markDirty();
    setEntities(prev => prev.map(e => e.id === id ? { ...e, [type]: [...e[type], value], completeness: calculateCompleteness({ ...e, [type]: [...e[type], value] }) } : e));
  };
  const removeExample = (id: number, type: 'positives' | 'negatives', index: number) => {
    markDirty();
    setEntities(prev => prev.map(e => e.id === id ? { ...e, [type]: e[type].filter((_: any, i: number) => i !== index), completeness: calculateCompleteness({ ...e, [type]: e[type].filter((_: any, i: number) => i !== index) }) } : e));
  };
  const addSynonym = (id: number, value: string) => {
    if (!value) return; markDirty();
    setEntities(prev => prev.map(e => e.id === id ? { ...e, synonyms: [...e.synonyms, value], completeness: calculateCompleteness({ ...e, synonyms: [...e.synonyms, value] }) } : e));
  };
  const removeSynonym = (id: number, index: number) => {
    markDirty();
    setEntities(prev => prev.map(e => e.id === id ? { ...e, synonyms: e.synonyms.filter((_: any, i: number) => i !== index) } : e));
  };
  const addKeyword = (id: number, type: 'must' | 'nice' | 'neg', value: string) => {
    if (!value) return; markDirty();
    setEntities(prev => prev.map(e => e.id === id ? { ...e, keywords: { ...e.keywords, [type]: [...e.keywords[type], value] } } : e));
  };
  const removeKeyword = (id: number, type: 'must' | 'nice' | 'neg', index: number) => {
    markDirty();
    setEntities(prev => prev.map(e => e.id === id ? { ...e, keywords: { ...e.keywords, [type]: e.keywords[type].filter((_: any, i: number) => i !== index) } } : e));
  };
  const toggleZone = (id: number, zone: string) => {
    markDirty();
    setEntities(prev => prev.map(e => {
      if (e.id !== id) return e;
      const newZones = e.zones.includes(zone) ? e.zones.filter((z: string) => z !== zone) : [...e.zones, zone];
      return { ...e, zones: newZones, completeness: calculateCompleteness({ ...e, zones: newZones }) };
    }));
  };

  const handlePublish = async () => {
    if (!entities.length) return;
    if (!projectName.trim()) {
      toast({ title: "Missing name", description: "Please set a template name", variant: "destructive" });
      return;
    }
    setPublishStatus("publishing");
    try {
      const templateEntities = entities.map(e => ({
        label: e.label, definition: e.definition, synonyms: e.synonyms,
        positives: e.positives, negatives: e.negatives, zones: e.zones,
        keywords: e.keywords, pattern: e.pattern,
      }));
      const url = editingTemplateId ? `/api/templates/${editingTemplateId}` : "/api/templates";
      const method = editingTemplateId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: projectName, description: `${entities.length} entities`, version: "1.0", entities: templateEntities }) });
      if (!res.ok) throw new Error("Failed to publish");
      const saved = await res.json();
      if (saved.id) setEditingTemplateId(saved.id);
      setPublishStatus("published");
      setHasUnsavedChanges(false);
      await fetchTemplates();
      toast({ title: editingTemplateId ? "Template updated" : "Template published", description: `"${projectName}" saved to repository` });
      setTimeout(() => { setShowPublishModal(false); setPublishStatus("idle"); }, 1200);
    } catch (err) {
      console.error("Error publishing:", err);
      setPublishStatus("error");
      toast({ title: "Publish failed", description: "Could not save template", variant: "destructive" });
      setTimeout(() => setPublishStatus("idle"), 2000);
    }
  };

  const exportEntities = () => {
    const dataStr = JSON.stringify(entities, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `entities-${projectName.replace(/\s+/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${entities.length} entities saved as JSON` });
  };

  const startNew = () => {
    setEntities([]);
    setProjectName("My Template");
    setEditingTemplateId(null);
    setHasUnsavedChanges(false);
    setSidebarTab("entities");
  };

  const completenessColor = (pct: number) => pct >= 80 ? 'text-emerald-400' : pct >= 40 ? 'text-purple-400' : 'text-amber-400';
  const completenessBarColor = (pct: number) => pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-purple-500' : 'bg-amber-500';

  return (
    <div className="bg-black text-white font-sans h-screen overflow-hidden flex flex-col" style={{ letterSpacing: '-0.011em' }}>

      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'fadeIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={() => publishStatus === 'idle' && setShowPublishModal(false)} />
          <div className="relative bg-[#1c1c1e] rounded-3xl shadow-2xl w-full max-w-md p-8 scale-in" style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5)' }}>
            {publishStatus === "idle" && (
              <>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/15 to-purple-400/15 flex items-center justify-center mx-auto mb-6 ring-1 ring-purple-500/20">
                  <Upload className="text-purple-400 w-7 h-7" />
                </div>
                <h3 className="text-xl font-semibold text-white text-center mb-1.5 tracking-tight">{editingTemplateId ? "Update Template" : "Publish Template"}</h3>
                <p className="text-sm text-[#8e8e93] text-center mb-8">{editingTemplateId ? `Save changes to "${projectName}"` : `Publish ${entities.length} entities to the repository`}</p>
                <div className="rounded-2xl p-4 mb-8 space-y-3 bg-[#2c2c2e]">
                  <div className="flex justify-between text-sm"><span className="text-[#8e8e93]">Template</span><span className="text-white font-medium">{projectName}</span></div>
                  <div className="h-px bg-[#3a3a3c]" />
                  <div className="flex justify-between text-sm"><span className="text-[#8e8e93]">Entities</span><span className="text-white font-medium">{entities.length}</span></div>
                  <div className="h-px bg-[#3a3a3c]" />
                  <div className="flex justify-between text-sm"><span className="text-[#8e8e93]">Avg. completeness</span><span className={`font-semibold ${completenessColor(entities.length > 0 ? Math.round(entities.reduce((a, e) => a + e.completeness, 0) / entities.length) : 0)}`}>{entities.length > 0 ? Math.round(entities.reduce((a, e) => a + e.completeness, 0) / entities.length) : 0}%</span></div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowPublishModal(false)} className="flex-1 py-3 rounded-xl font-medium text-[14px] smooth press-sm text-white bg-[#2c2c2e]">Cancel</button>
                  <button onClick={handlePublish} className="flex-1 py-3 bg-gradient-to-b from-purple-600 to-purple-700 text-white rounded-xl font-semibold text-[14px] smooth press-sm hover:from-purple-500 hover:to-purple-600 shadow-lg shadow-purple-500/25" data-testid="button-confirm-publish">
                    {editingTemplateId ? "Update" : "Publish"}
                  </button>
                </div>
              </>
            )}
            {publishStatus === "publishing" && (
              <div className="py-12 text-center">
                <Loader2 className="text-purple-400 w-8 h-8 mb-4 animate-spin mx-auto" />
                <p className="text-[#8e8e93]">Saving to repository...</p>
              </div>
            )}
            {publishStatus === "published" && (
              <div className="py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4 ring-1 ring-emerald-500/20">
                  <Check className="text-emerald-400 w-7 h-7" />
                </div>
                <p className="text-white font-semibold text-lg">Saved Successfully</p>
                <p className="text-sm text-[#8e8e93] mt-1">Your template is ready to use</p>
              </div>
            )}
            {publishStatus === "error" && (
              <div className="py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4 ring-1 ring-red-500/20">
                  <X className="text-red-400 w-7 h-7" />
                </div>
                <p className="text-white font-semibold text-lg">Failed to Save</p>
                <p className="text-sm text-[#8e8e93] mt-1">Please try again</p>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'fadeIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-[#1c1c1e] rounded-3xl shadow-2xl w-full max-w-sm p-7 scale-in" style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5)' }}>
            <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-5 ring-1 ring-red-500/20">
              <Trash2 className="text-red-400 w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white text-center mb-2 tracking-tight">Delete Template?</h3>
            <p className="text-sm text-[#8e8e93] text-center mb-7 leading-relaxed">This cannot be undone. The template will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl font-medium text-sm smooth press-sm text-white bg-[#2c2c2e]">Cancel</button>
              <button onClick={() => deleteTemplateFromRepo(deleteConfirm)} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-400 smooth press-sm font-semibold text-sm shadow-lg shadow-red-500/20" data-testid="button-confirm-delete">Delete</button>
            </div>
          </div>
        </div>
      )}

      <header className="h-[52px] shrink-0 z-20 flex items-center justify-between px-5 bg-black" style={{ borderBottom: '1px solid #2c2c2e' }}>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 transition-all duration-200 press-sm group" data-testid="btn-back">
            <ChevronLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            <img src={logoCircle} alt="Okiru" className="h-7 w-7 rounded-[8px]" />
          </Link>
          <div className="h-4 w-px bg-[#3a3a3c] mx-0.5" />
          {isEditingProjectName ? (
            <input autoFocus value={projectName} onChange={(e) => setProjectName(e.target.value)}
              onBlur={() => { setIsEditingProjectName(false); if (editingTemplateId) markDirty(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setIsEditingProjectName(false); if (editingTemplateId) markDirty(); } if (e.key === 'Escape') setIsEditingProjectName(false); }}
              className="bg-[#1c1c1e] border border-purple-500/40 text-sm rounded-lg px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all w-48" data-testid="input-project-name" />
          ) : (
            <button onClick={() => setIsEditingProjectName(true)} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] hover:bg-[#1c1c1e] smooth press-sm group" data-testid="button-edit-project-name">
              <span className="text-white font-medium">{projectName}</span>
              <Pencil className="w-2.5 h-2.5 text-[#636366] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          {editingTemplateId && (
            <span className="text-[10px] px-2 py-0.5 bg-purple-500/15 text-purple-400 rounded-md font-medium">Editing</span>
          )}
          {hasUnsavedChanges && (
            <span className="text-[10px] px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded-md font-medium flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
              Unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={exportEntities} disabled={entities.length === 0} className="p-2 text-[#8e8e93] hover:text-white smooth press-sm rounded-lg hover:bg-[#1c1c1e] disabled:opacity-25" data-testid="button-export" title="Export JSON">
            <Download className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-[#2c2c2e] mx-0.5" />
          {hasUnsavedChanges && editingTemplateId && (
            <button onClick={saveChanges} disabled={isSaving}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg text-[12px] font-semibold smooth press-sm" data-testid="button-save-header">
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
            </button>
          )}
          <button onClick={() => entities.length > 0 && setShowPublishModal(true)} disabled={entities.length === 0}
            className="px-4 py-1.5 bg-gradient-to-b from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 disabled:opacity-25 disabled:cursor-not-allowed text-white rounded-lg text-[12px] font-semibold smooth press-sm shadow-sm shadow-purple-500/20" data-testid="button-publish">
            {editingTemplateId ? "Update" : "Publish"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 flex flex-col shrink-0 bg-[#1c1c1e]" style={{ borderRight: '1px solid #2c2c2e' }}>
          <nav className="flex-1 p-2.5 space-y-0.5">
            <button onClick={() => setSidebarTab("entities")} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium smooth press-sm relative ${sidebarTab === 'entities' ? 'bg-[#2c2c2e] text-white shadow-sm' : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.06]'}`} data-testid="tab-entities">
              {sidebarTab === 'entities' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-purple-500" />}
              <Shapes className="w-4 h-4" /> Entities
              {entities.length > 0 && <span className="ml-auto text-[10px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-full font-semibold tabular-nums">{entities.length}</span>}
            </button>
            <button onClick={() => { setSidebarTab("repository"); fetchTemplates(); }} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium smooth press-sm relative ${sidebarTab === 'repository' ? 'bg-[#2c2c2e] text-white shadow-sm' : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.06]'}`} data-testid="tab-repository">
              {sidebarTab === 'repository' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-purple-500" />}
              <Folder className="w-4 h-4" /> Templates
              {storedTemplates.length > 0 && <span className="ml-auto text-[10px] bg-[#2c2c2e] px-1.5 py-0.5 rounded-full font-semibold tabular-nums">{storedTemplates.length}</span>}
            </button>
          </nav>

          <div className="p-2.5 border-t border-[#2c2c2e] space-y-1.5">
            {editingTemplateId && (
              <button onClick={startNew} className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[#8e8e93] hover:text-white rounded-lg text-[11px] smooth press-sm hover:bg-[#2c2c2e]" data-testid="button-start-new">
                <FilePlus className="w-3 h-3" /> New Template
              </button>
            )}
            <button onClick={addNewEntity} className="w-full flex items-center justify-center gap-1.5 px-2 py-2 border border-dashed border-[#3a3a3c] text-[#8e8e93] hover:text-purple-400 hover:border-purple-500/40 rounded-lg text-[12px] smooth press-sm" data-testid="button-new-entity">
              <Plus className="w-3.5 h-3.5" /> Add Entity
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-black overflow-hidden">
          {sidebarTab === "entities" && (
            <>
              <div className="px-6 py-4 bg-black" style={{ borderBottom: '1px solid #2c2c2e' }}>
                <div className="max-w-2xl mx-auto">
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Sparkles className={`w-4 h-4 transition-colors duration-300 ${nlInput.trim() ? 'text-purple-400' : 'text-[#636366]'}`} />
                    </div>
                    <input ref={nlInputRef} type="text" id="nlInput" value={nlInput} onChange={(e) => setNlInput(e.target.value)}
                      className="w-full bg-[#1c1c1e] text-white rounded-2xl pl-11 pr-28 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500/30 smooth placeholder-[#48484a] text-[14px]"
                      placeholder="Describe an entity to extract..."
                      onKeyDown={(e) => e.key === 'Enter' && !isGenerating && parseNaturalLanguage()} data-testid="input-nl" />
                    <button onClick={parseNaturalLanguage} disabled={isGenerating || !nlInput.trim()} data-testid="button-generate"
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-gradient-to-b from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 disabled:from-[#2c2c2e] disabled:to-[#2c2c2e] disabled:text-[#636366] text-white rounded-xl font-semibold smooth press-sm text-[12px] shadow-sm shadow-purple-500/20 disabled:shadow-none flex items-center gap-1.5">
                      {isGenerating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating...</> : <><Zap className="w-3.5 h-3.5" />Create</>}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="max-w-2xl mx-auto space-y-3">
                  {hasUnsavedChanges && editingTemplateId && (
                    <div className="flex items-center justify-between rounded-xl px-4 py-2.5 bg-amber-500/10 fade-in" data-testid="banner-unsaved-changes">
                      <span className="text-[13px] text-amber-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Unsaved changes
                        <span className="text-[11px] text-amber-500 hidden sm:inline ml-1">{navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+S to save</span>
                      </span>
                      <button onClick={saveChanges} disabled={isSaving}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg text-[12px] font-semibold smooth press-sm" data-testid="button-save-changes">
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  )}

                  {entities.length === 0 && (
                    <div className="text-center py-24 fade-in">
                      <div className="relative mx-auto mb-6 w-20 h-20">
                        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-purple-500/8 to-purple-400/8 ring-1 ring-purple-500/10" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Box className="text-purple-400/60 w-8 h-8" />
                        </div>
                      </div>
                      <p className="text-white text-lg font-semibold tracking-tight mb-2">No entities yet</p>
                      <p className="text-[#8e8e93] text-[13px] max-w-xs mx-auto leading-relaxed">
                        Describe what you need to extract above, or add one manually from the sidebar.
                      </p>
                      <div className="flex items-center justify-center gap-6 mt-8">
                        <div className="flex items-center gap-2 text-[11px] text-[#636366]">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400/50" />
                          AI-powered
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#636366]">
                          <Zap className="w-3.5 h-3.5 text-amber-400/50" />
                          Instant creation
                        </div>
                      </div>
                    </div>
                  )}

                  {entities.map((entity, idx) => (
                    <div key={entity.id} className={`rounded-2xl overflow-hidden smooth hover:bg-[#2c2c2e] fade-in stagger-${Math.min(idx + 1, 6)} bg-[#1c1c1e]`} data-testid={`card-entity-${entity.id}`}>
                      <div className="px-5 py-3.5 flex items-center justify-between cursor-pointer smooth" onClick={() => updateEntity(entity.id, 'expanded', !entity.expanded)}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold shrink-0 bg-purple-500/10 text-purple-400">
                            {entity.label.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-white text-[14px] tracking-tight truncate">{entity.label}</h3>
                            <p className="text-[11px] text-[#98989f] max-w-md truncate mt-0.5">{entity.definition}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-3">
                          <div className="w-20 mr-1 hidden sm:block">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1 bg-[#2c2c2e] rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-700 ease-out rounded-full ${completenessBarColor(entity.completeness)}`} style={{ width: `${entity.completeness}%` }} />
                              </div>
                              <span className={`text-[10px] font-semibold tabular-nums w-6 text-right ${completenessColor(entity.completeness)}`}>{entity.completeness}%</span>
                            </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); duplicateEntity(entity.id); }} className="p-1.5 text-[#636366] hover:text-[#d1d1d6] rounded-lg hover:bg-white/[0.06] smooth press-sm" title="Duplicate" data-testid={`button-duplicate-${entity.id}`}>
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); deleteEntity(entity.id); }} className="p-1.5 text-[#636366] hover:text-red-400 rounded-lg hover:bg-red-500/10 smooth press-sm" title="Delete" data-testid={`button-delete-${entity.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <ChevronDown className={`text-[#636366] w-3.5 h-3.5 transition-transform duration-300 ease-out ml-0.5 ${entity.expanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>

                      {entity.expanded && (
                        <div className="border-t border-transparent" style={{ animation: 'slideDown 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
                          <div className="flex border-b border-[#2c2c2e] px-5 gap-0.5">
                            {(["definition", "hints", "validation"] as const).map(tab => (
                              <button key={tab} onClick={() => updateEntity(entity.id, 'activeTab', tab)}
                                className={`py-2.5 px-3.5 text-[12px] font-medium border-b-2 smooth capitalize transition-all duration-200 ${entity.activeTab === tab ? 'border-purple-500 text-white' : 'border-transparent text-[#636366] hover:text-[#d1d1d6]'}`}>
                                {tab}
                              </button>
                            ))}
                          </div>

                          <div className="p-5" onClick={(e) => e.stopPropagation()}>
                            {entity.activeTab === 'definition' && (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-[11px] font-medium text-[#8e8e93] uppercase tracking-wider mb-1.5">Label</label>
                                    <input type="text" className="w-full bg-[#2c2c2e] border border-transparent rounded-xl px-3 py-2 text-sm text-white focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/10 transition-all"
                                      value={entity.label} onChange={(e) => updateEntity(entity.id, 'label', e.target.value)} data-testid={`input-label-${entity.id}`} />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-[#8e8e93] uppercase tracking-wider mb-1.5">Pattern</label>
                                    <input type="text" className="w-full bg-[#2c2c2e] border border-transparent rounded-xl px-3 py-2 text-sm text-white font-mono focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/10 transition-all"
                                      placeholder="e.g. INV-\d{4}" value={entity.pattern} onChange={(e) => updateEntity(entity.id, 'pattern', e.target.value)} data-testid={`input-pattern-${entity.id}`} />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-[#8e8e93] uppercase tracking-wider mb-1.5">Definition</label>
                                  <textarea className="w-full bg-[#2c2c2e] border border-transparent rounded-xl px-3 py-2 text-sm text-white focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/10 transition-all resize-none"
                                    rows={2} value={entity.definition} onChange={(e) => updateEntity(entity.id, 'definition', e.target.value)} data-testid={`input-definition-${entity.id}`} />
                                </div>
                                <TagField label="Synonyms" color="blue" items={entity.synonyms} onAdd={(v) => addSynonym(entity.id, v)} onRemove={(i) => removeSynonym(entity.id, i)} placeholder="Type synonym + Enter" />
                                <TagField label="Positive Examples" color="green" items={entity.positives} onAdd={(v) => addExample(entity.id, 'positives', v)} onRemove={(i) => removeExample(entity.id, 'positives', i)} placeholder="Type example + Enter" />
                                <TagField label="Negative Examples" color="red" items={entity.negatives} onAdd={(v) => addExample(entity.id, 'negatives', v)} onRemove={(i) => removeExample(entity.id, 'negatives', i)} placeholder="Type anti-example + Enter" />
                              </div>
                            )}

                            {entity.activeTab === 'hints' && (
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-[11px] font-medium text-[#8e8e93] uppercase tracking-wider mb-2">Zones</label>
                                  <div className="flex flex-wrap gap-1.5">
                                    {["Email Subject", "Email Body", "PDF Header", "Tables", "Footer", "Signature Block"].map(zone => (
                                      <button key={zone} onClick={() => toggleZone(entity.id, zone)}
                                        className={`px-3 py-1.5 rounded-lg text-[12px] smooth press-sm transition-all ${entity.zones.includes(zone) ? 'bg-purple-500/15 text-purple-400 border border-purple-500/25 shadow-sm shadow-purple-500/10' : 'bg-[#2c2c2e] text-[#636366] border border-transparent hover:bg-[#3a3a3c] hover:text-[#8e8e93]'}`}>
                                        {zone}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                  <TagField label="Must Keywords" color="green" items={entity.keywords.must} onAdd={(v) => addKeyword(entity.id, 'must', v)} onRemove={(i) => removeKeyword(entity.id, 'must', i)} placeholder="Add..." />
                                  <TagField label="Nice Keywords" color="blue" items={entity.keywords.nice} onAdd={(v) => addKeyword(entity.id, 'nice', v)} onRemove={(i) => removeKeyword(entity.id, 'nice', i)} placeholder="Add..." />
                                  <TagField label="Neg Keywords" color="red" items={entity.keywords.neg} onAdd={(v) => addKeyword(entity.id, 'neg', v)} onRemove={(i) => removeKeyword(entity.id, 'neg', i)} placeholder="Add..." />
                                </div>
                              </div>
                            )}

                            {entity.activeTab === 'validation' && (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                  {[
                                    { check: entity.definition.length > 10, text: "Definition", Icon: AlignLeft },
                                    { check: entity.positives.length > 0, text: `Positives (${entity.positives.length})`, Icon: Check },
                                    { check: entity.negatives.length > 0, text: `Negatives (${entity.negatives.length})`, Icon: X },
                                    { check: entity.synonyms.length > 0, text: `Synonyms (${entity.synonyms.length})`, Icon: Tags },
                                    { check: entity.zones.length > 0, text: `Zones (${entity.zones.length})`, Icon: Map },
                                    { check: !!entity.pattern, text: "Pattern", Icon: Code },
                                  ].map((item, i) => (
                                    <div key={i} className={`flex items-center gap-2.5 py-2 px-3 rounded-xl text-[12px] transition-all ${item.check ? 'bg-emerald-500/8 border border-emerald-500/12' : 'bg-[#2c2c2e] border border-transparent'}`}>
                                      {item.check ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <item.Icon className="w-3.5 h-3.5 text-[#636366] shrink-0" />}
                                      <span className={item.check ? 'text-white' : 'text-[#636366]'}>{item.text}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="rounded-xl p-4 bg-[#2c2c2e]">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-[12px] font-medium text-[#8e8e93]">Overall Completeness</span>
                                    <span className={`text-[13px] font-bold tabular-nums ${completenessColor(entity.completeness)}`}>{entity.completeness}%</span>
                                  </div>
                                  <div className="h-1.5 bg-[#1c1c1e] rounded-full overflow-hidden">
                                    <div className={`h-full transition-all duration-700 ease-out rounded-full ${completenessBarColor(entity.completeness)}`} style={{ width: `${entity.completeness}%` }} />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {sidebarTab === "repository" && (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-semibold text-white tracking-tight">Templates</h2>
                    <p className="text-[12px] text-[#98989f] mt-0.5">Published templates for document processing</p>
                  </div>
                  <button onClick={fetchTemplates} className="p-2 text-[#98989f] hover:text-white smooth press-sm rounded-lg hover:bg-[#1c1c1e]" data-testid="button-refresh-templates" title="Refresh">
                    <RefreshCw className={`w-4 h-4 ${loadingTemplates ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {loadingTemplates && storedTemplates.length === 0 && (
                  <div className="space-y-3">
                    {[1, 2].map(i => (
                      <div key={i} className="rounded-2xl p-5 bg-[#1c1c1e]">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-9 w-9 rounded-xl shimmer bg-white/[0.06]" />
                          <div className="flex-1">
                            <div className="h-4 rounded-lg w-1/3 mb-2 shimmer bg-white/[0.06]" />
                            <div className="h-3 rounded-lg w-1/4 shimmer bg-white/[0.06]" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!loadingTemplates && storedTemplates.length === 0 && (
                  <div className="text-center py-20 fade-in">
                    <div className="relative mx-auto mb-6 w-20 h-20">
                      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-purple-500/8 to-purple-400/8 ring-1 ring-purple-500/10" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <FolderOpen className="text-purple-400/50 w-8 h-8" />
                      </div>
                    </div>
                    <p className="text-white font-semibold tracking-tight mb-1">No templates yet</p>
                    <p className="text-[#98989f] text-[13px]">Create entities and publish them</p>
                  </div>
                )}

                {storedTemplates.length > 0 && (
                  <div className="space-y-2.5">
                    {storedTemplates.map(template => (
                      <div key={template.id}
                        className={`rounded-2xl p-4 cursor-pointer transition-all duration-200 bg-[#1c1c1e] ${editingTemplateId === template.id ? 'ring-1 ring-purple-500/30' : selectedRepoTemplate?.id === template.id ? 'ring-1 ring-[#3a3a3c]' : ''}`}
                        onClick={() => setSelectedRepoTemplate(selectedRepoTemplate?.id === template.id ? null : template)} data-testid={`template-card-${template.id}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(147,51,234,0.1)' }}>
                              <Folder className="w-4 h-4 text-purple-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-white text-[14px] truncate tracking-tight">{template.name}</h3>
                                {editingTemplateId === template.id && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/12 text-purple-400 rounded font-medium shrink-0">Active</span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#98989f] mt-0.5">{template.entities.length} entities · v{template.version || '1.0'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-3">
                            <button onClick={(e) => { e.stopPropagation(); loadTemplateFromRepo(template); }}
                              className="px-3 py-1.5 bg-purple-500/12 text-purple-400 rounded-lg text-[12px] hover:bg-purple-500/20 smooth press-sm font-medium" data-testid={`button-load-${template.id}`}>
                              Load
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(template.id); }}
                              className="p-1.5 text-[#636366] hover:text-red-400 rounded-lg hover:bg-red-500/10 smooth press-sm" data-testid={`button-delete-template-${template.id}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {selectedRepoTemplate?.id === template.id && (
                          <div className="mt-3 pt-3 border-t border-[#2c2c2e]">
                            <div className="flex flex-wrap gap-1.5">
                              {template.entities.map((e: any, i: number) => (
                                <span key={i} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#2c2c2e] text-[#8e8e93]">{e.label}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 800px; }
        }
      `}</style>
    </div>
  );
}

function TagField({ label, color, items, onAdd, onRemove, placeholder }: {
  label: string; color: string; items: string[]; onAdd: (v: string) => void; onRemove: (i: number) => void; placeholder: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    blue: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/15' },
    green: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/15' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/15' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div>
      <label className="block text-[11px] font-medium text-[#8e8e93] uppercase tracking-wider mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 p-2.5 bg-[#2c2c2e] border border-transparent rounded-xl min-h-[40px] items-center focus-within:border-purple-500/30 focus-within:ring-2 focus-within:ring-purple-500/8 transition-all">
        {items.map((item: string, i: number) => (
          <span key={i} className={`${c.bg} ${c.text} text-[11px] px-2 py-0.5 rounded-md border ${c.border} flex items-center gap-1 transition-all hover:scale-105`}>
            {item}
            <button onClick={() => onRemove(i)} className="opacity-50 hover:opacity-100 transition-opacity ml-0.5"><X className="w-2.5 h-2.5" /></button>
          </span>
        ))}
        <input type="text" className="bg-transparent border-none outline-none text-[13px] text-white flex-1 min-w-[80px] placeholder-[#48484a]" placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { onAdd(e.currentTarget.value.trim()); e.currentTarget.value = ''; e.preventDefault(); }}} />
      </div>
    </div>
  );
}
