import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'wouter';
import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/hooks/use-toast';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import {
  Upload, Loader2, Check, X, Trash2, Pencil, Download,
  Shapes, Folder, FilePlus, Copy, AlignLeft, Tags,
  Map, Code, CheckCircle2, RefreshCw, FolderOpen, ChevronLeft, Sparkles,
  Zap, Plus, ChevronRight, MoreHorizontal, Search, FlaskConical,
  BookOpen, Play, ChevronDown, Clock,
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

function CompletenessRing({ pct }: { pct: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? '#34d399' : pct >= 40 ? '#a78bfa' : '#fbbf24';
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0 -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#2c2c2e" strokeWidth="3" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
    </svg>
  );
}

export default function EntityBuilder() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showTemplatesPanel, setShowTemplatesPanel] = useState(false);
  const [nlInput, setNlInput] = useState("");
  const [entities, setEntities] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
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
  const [entitySearch, setEntitySearch] = useState("");
  const [savedDrafts, setSavedDrafts] = useState<{ id: string; name: string; entities: any[]; savedAt: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('okiru-entity-drafts') || '[]'); } catch { return []; }
  });
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [leftTab, setLeftTab] = useState<'entities' | 'repository'>('entities');
  const [rightTab, setRightTab] = useState<'editor' | 'test'>('editor');
  const [testText, setTestText] = useState('');
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testTemplateId, setTestTemplateId] = useState<'current' | number>('current');
  const [testTemplateDropOpen, setTestTemplateDropOpen] = useState(false);
  const testTemplateDropRef = useRef<HTMLDivElement>(null);
  const [expandedRepoId, setExpandedRepoId] = useState<number | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!params.get('template');
  });
  const nlInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selectedEntity = entities.find(e => e.id === selectedEntityId) || null;

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/templates");
      if (res.ok) setStoredTemplates(await res.json());
    } catch (err) {
      console.error("Error fetching templates:", err);
      setIsLoadingTemplate(false);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('template') || params.get('starter')) return;
    const draft = localStorage.getItem('okiru-entity-draft');
    if (draft && entities.length === 0 && !editingTemplateId) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.entities?.length > 0) {
          setEntities(parsed.entities);
          setProjectName(parsed.projectName || "My Template");
          setSelectedEntityId(parsed.entities[0]?.id || null);
          setHasUnsavedChanges(true);
          toast({ title: "Draft restored", description: `${parsed.entities.length} entities recovered` });
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (entities.length > 0 && !editingTemplateId) {
      localStorage.setItem('okiru-entity-draft', JSON.stringify({ entities, projectName }));
    } else if (entities.length === 0 && !editingTemplateId) {
      localStorage.removeItem('okiru-entity-draft');
    }
  }, [entities, projectName, editingTemplateId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const templateId = params.get('template');
    if (templateId && storedTemplates.length > 0 && !editingTemplateId) {
      const t = storedTemplates.find(st => st.id === Number(templateId));
      if (t) _loadTemplateFromRepo(t);
      else {
        setIsLoadingTemplate(false);
        toast({ title: "Template not found", description: "Could not find the requested template.", variant: "destructive" });
      }
    }
  }, [storedTemplates]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const starterKey = params.get('starter');
    if (starterKey && starterTemplatesMap[starterKey] && entities.length === 0) {
      const starter = starterTemplatesMap[starterKey];
      const starterEntities = starter.entities.map((e: any) => ({
        ...createEntity(e.label, e.definition, 80),
        synonyms: e.synonyms, positives: e.positives, negatives: e.negatives,
        zones: e.zones, keywords: e.keywords, pattern: e.pattern,
      }));
      setEntities(starterEntities);
      setProjectName(starter.name);
      if (starterEntities.length > 0) setSelectedEntityId(starterEntities[0].id);
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && entities.length > 0) {
          if (editingTemplateId) saveChanges();
          else setShowPublishModal(true);
        }
      }
      if (e.key === 'Escape' && showPublishModal) setShowPublishModal(false);
      if (e.key === 'Escape' && deleteConfirm !== null) setDeleteConfirm(null);
      if (e.key === 'Escape' && showTemplatesPanel) setShowTemplatesPanel(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingTemplateId, hasUnsavedChanges, entities, showPublishModal, deleteConfirm, showTemplatesPanel]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (testTemplateDropRef.current && !testTemplateDropRef.current.contains(e.target as Node)) {
        setTestTemplateDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadTemplateFromRepo = (template: StoredTemplate) => guardedNew(() => _loadTemplateFromRepo(template));
  const _loadTemplateFromRepo = (template: StoredTemplate) => {
    const loadedEntities = template.entities.map((e: any) => ({
      ...createEntity(e.label, e.definition, 60),
      synonyms: e.synonyms || [], positives: e.positives || [], negatives: e.negatives || [],
      zones: e.zones || ["Email Body", "PDF Header"],
      keywords: e.keywords || { must: [], nice: [], neg: [] },
      pattern: e.pattern || "",
    }));
    setEntities(loadedEntities);
    setProjectName(template.name);
    setEditingTemplateId(template.id);
    setHasUnsavedChanges(false);
    setSelectedEntityId(loadedEntities.length > 0 ? loadedEntities[0].id : null);
    setShowTemplatesPanel(false);
    setIsLoadingTemplate(false);
    toast({ title: "Template loaded", description: `"${template.name}" — ${loadedEntities.length} entities` });
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
        toast({ title: "Template deleted", description: `"${template?.name}" removed` });
      }
    } catch {
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
        setSelectedEntityId(newEntity.id);
        setNlInput("");
        markDirty();
        toast({ title: "Entity created", description: `"${newEntity.label}" added` });
      } else {
        toast({ title: "No entity generated", description: "Try a more specific description", variant: "destructive" });
      }
    } catch {
      toast({ title: "Generation failed", description: "Could not generate entity", variant: "destructive" });
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

  const markDirty = () => setHasUnsavedChanges(true);

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
      toast({ title: "Changes saved", description: `"${projectName}" updated` });
    } catch {
      toast({ title: "Save failed", description: "Could not save changes", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const updateEntity = (id: number, field: string, value: any) => {
    markDirty();
    setEntities(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: value };
      updated.completeness = calculateCompleteness(updated);
      return updated;
    }));
  };

  const deleteEntity = (id: number) => {
    const entity = entities.find(e => e.id === id);
    markDirty();
    setEntities(prev => {
      const next = prev.filter(e => e.id !== id);
      if (selectedEntityId === id) setSelectedEntityId(next.length > 0 ? next[0].id : null);
      return next;
    });
    toast({ title: "Entity removed", description: `"${entity?.label}" deleted` });
  };

  const duplicateEntity = (id: number) => {
    const source = entities.find(e => e.id === id);
    if (!source) return;
    const newEntity = { ...source, id: Date.now() + Math.random(), label: source.label + "_copy" };
    setEntities(prev => [...prev, newEntity]);
    setSelectedEntityId(newEntity.id);
    markDirty();
    toast({ title: "Duplicated", description: `"${source.label}" copied` });
  };

  const addItem = (id: number, field: string, value: string) => {
    if (!value) return; markDirty();
    setEntities(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: [...e[field], value] };
      updated.completeness = calculateCompleteness(updated);
      return updated;
    }));
  };
  const removeItem = (id: number, field: string, index: number) => {
    markDirty();
    setEntities(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: e[field].filter((_: any, i: number) => i !== index) };
      updated.completeness = calculateCompleteness(updated);
      return updated;
    }));
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
      localStorage.removeItem('okiru-entity-draft');
      await fetchTemplates();
      toast({ title: editingTemplateId ? "Template updated" : "Template published", description: `"${projectName}" saved` });
      setTimeout(() => { setShowPublishModal(false); setPublishStatus("idle"); }, 1200);
    } catch {
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
    setSelectedEntityId(null);
    localStorage.removeItem('okiru-entity-draft');
  };

  const saveDraftItem = () => {
    const draft = { id: Date.now().toString(), name: projectName, entities, savedAt: new Date().toISOString() };
    const updated = [draft, ...savedDrafts.filter(d => d.name !== projectName || d.entities.length !== entities.length)].slice(0, 5);
    setSavedDrafts(updated);
    localStorage.setItem('okiru-entity-drafts', JSON.stringify(updated));
    toast({ title: "Draft saved", description: `"${projectName}" — ${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}` });
  };

  const deleteDraft = (id: string) => {
    const updated = savedDrafts.filter(d => d.id !== id);
    setSavedDrafts(updated);
    localStorage.setItem('okiru-entity-drafts', JSON.stringify(updated));
  };

  const resumeDraft = (draft: { id: string; name: string; entities: any[]; savedAt: string }) => {
    const loaded = draft.entities.map((e: any, i: number) => ({ ...e, id: Date.now() + i }));
    setEntities(loaded);
    setProjectName(draft.name);
    setEditingTemplateId(null);
    setHasUnsavedChanges(true);
    setSelectedEntityId(loaded.length > 0 ? loaded[0].id : null);
    setLeftTab('entities');
    deleteDraft(draft.id);
    toast({ title: "Draft resumed", description: `"${draft.name}" — ${draft.entities.length} ${draft.entities.length === 1 ? 'entity' : 'entities'}` });
  };

  const relativeTime = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const guardedNew = (action: () => void) => {
    if (entities.length > 0 && !editingTemplateId) {
      setPendingAction(() => action);
      setShowDraftPrompt(true);
    } else {
      action();
    }
  };

  const clientExtract = (text: string, ents: any[]) => ents.map((e, idx) => {
    let value: string | null = null, method = 'Not found', confidence = 0;
    if (e.pattern) {
      try {
        const m = text.match(new RegExp(e.pattern, 'i'));
        if (m) { value = m[0]; method = 'Pattern'; confidence = 87; }
      } catch {}
    }
    if (!value) {
      const kwList = [...(e.keywords?.must || []), ...(e.synonyms || []), e.label];
      for (const kw of kwList) {
        const pos = text.toLowerCase().indexOf(kw.toLowerCase());
        if (pos !== -1) {
          const s = Math.max(0, pos - 60), end = Math.min(text.length, pos + 100);
          value = text.slice(s, end).replace(/\s+/g, ' ').trim();
          method = 'Context'; confidence = 55; break;
        }
      }
    }
    return { id: idx + 1, name: e.label, value, method, confidence, status: value ? 'extracted' : 'not_found' };
  });

  const runTest = async () => {
    if (!testText.trim()) return;
    setIsTesting(true);
    const entsToTest = testTemplateId === 'current'
      ? entities
      : storedTemplates.find(t => t.id === testTemplateId)?.entities || [];
    if (entsToTest.length === 0) { setIsTesting(false); return; }
    setTestResults(clientExtract(testText, entsToTest));
    try {
      const res = await fetch('/api/extract-entities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentText: testText, entities: entsToTest }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.extractions?.some((e: any) => e.value)) {
          setTestResults(data.extractions.map((e: any, idx: number) => ({
            id: idx + 1, name: e.entity || entsToTest[idx]?.label || '',
            value: e.value, method: e.method, confidence: e.conf ?? 0,
            status: e.value ? 'extracted' : 'not_found',
          })));
        }
      }
    } catch {}
    setIsTesting(false);
  };

  const completenessColor = (pct: number) => pct >= 80 ? 'text-emerald-400' : pct >= 40 ? 'text-purple-400' : 'text-amber-400';
  const completenessBarColor = (pct: number) => pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-purple-500' : 'bg-amber-500';

  const filteredEntities = entitySearch.trim()
    ? entities.filter(e => e.label.toLowerCase().includes(entitySearch.toLowerCase()))
    : entities;

  const avgCompleteness = entities.length > 0
    ? Math.round(entities.reduce((a, e) => a + e.completeness, 0) / entities.length)
    : 0;

  return (
    <div className="bg-black text-white font-sans h-screen overflow-hidden flex flex-col select-none cursor-default" style={{ letterSpacing: '-0.011em' }}>

      {isLoadingTemplate && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/15 ring-1 ring-purple-500/20 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-purple-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-semibold text-white">Loading Template</p>
            <p className="text-[13px] text-[#636366] mt-1">Fetching entities…</p>
          </div>
        </div>
      )}

      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'fadeIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={() => publishStatus === 'idle' && setShowPublishModal(false)} />
          <div className="relative bg-[#1c1c1e] rounded-3xl shadow-2xl w-full max-w-md p-8" style={{ boxShadow: '0 32px 64px -16px rgba(0,0,0,0.6)', animation: 'scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
            {publishStatus === "idle" && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-purple-500/15 flex items-center justify-center mx-auto mb-6 ring-1 ring-purple-500/20">
                  <Upload className="text-purple-400 w-6 h-6" />
                </div>
                <h3 className="text-[18px] font-semibold text-white text-center mb-1 tracking-tight">
                  {editingTemplateId ? "Update Template" : "Publish Template"}
                </h3>
                <p className="text-[13px] text-[#636366] text-center mb-7">
                  {editingTemplateId ? `Save changes to "${projectName}"` : `Publish ${entities.length} entities to the repository`}
                </p>
                <div className="rounded-2xl bg-[#2c2c2e] divide-y divide-[#3a3a3c] mb-7">
                  <div className="flex justify-between items-center px-4 py-3 text-[13px]">
                    <span className="text-[#636366]">Template name</span>
                    <span className="text-white font-medium">{projectName}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3 text-[13px]">
                    <span className="text-[#636366]">Entities</span>
                    <span className="text-white font-medium">{entities.length}</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowPublishModal(false)} className="flex-1 py-3 rounded-xl font-medium text-[14px] text-[#b0b0b8] bg-[#2c2c2e] hover:bg-[#3a3a3c] smooth press-sm">Cancel</button>
                  <button onClick={handlePublish} className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold text-[14px] smooth press-sm shadow-lg shadow-purple-500/20" data-testid="button-confirm-publish">
                    {editingTemplateId ? "Update" : "Publish"}
                  </button>
                </div>
              </>
            )}
            {publishStatus === "publishing" && (
              <div className="py-14 text-center">
                <Loader2 className="text-purple-400 w-8 h-8 mb-4 animate-spin mx-auto" />
                <p className="text-[#636366] text-[14px]">Saving to repository…</p>
              </div>
            )}
            {publishStatus === "published" && (
              <div className="py-14 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4 ring-1 ring-emerald-500/20">
                  <Check className="text-emerald-400 w-6 h-6" />
                </div>
                <p className="text-white font-semibold">Saved successfully</p>
                <p className="text-[13px] text-[#636366] mt-1">Your template is ready to use</p>
              </div>
            )}
            {publishStatus === "error" && (
              <div className="py-14 text-center">
                <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4 ring-1 ring-red-500/20">
                  <X className="text-red-400 w-6 h-6" />
                </div>
                <p className="text-white font-semibold">Failed to save</p>
                <p className="text-[13px] text-[#636366] mt-1">Please try again</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showDraftPrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ animation: 'fadeIn 0.15s ease' }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={() => { setShowDraftPrompt(false); setPendingAction(null); }} />
          <div className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-3xl overflow-hidden" style={{ background: '#1c1c1e', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.7)', animation: 'scaleIn 0.18s cubic-bezier(0.16,1,0.3,1)' }}>
            <div className="px-6 pt-7 pb-2 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 ring-1 ring-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <FilePlus className="w-5 h-5 text-amber-400" />
              </div>
              <p className="text-[17px] font-semibold text-white tracking-tight">Save your work?</p>
              <p className="text-[13px] text-[#636366] mt-1.5 leading-relaxed">
                <span className="text-white font-medium">"{projectName}"</span> has {entities.length} {entities.length === 1 ? 'entity' : 'entities'} that haven't been published.
              </p>
            </div>
            <div className="px-4 pb-5 pt-4 flex flex-col gap-2.5">
              <button onClick={() => {
                saveDraftItem();
                setShowDraftPrompt(false);
                const action = pendingAction;
                setPendingAction(null);
                action?.();
              }} className="w-full py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-[14px] font-semibold smooth press-sm" data-testid="button-save-draft">
                Save to Drafts
              </button>
              <button onClick={() => {
                setShowDraftPrompt(false);
                const action = pendingAction;
                setPendingAction(null);
                action?.();
              }} className="w-full py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.10] text-[#b0b0b8] hover:text-white text-[14px] font-semibold smooth press-sm" data-testid="button-discard-draft">
                Discard
              </button>
              <button onClick={() => { setShowDraftPrompt(false); setPendingAction(null); }}
                className="w-full py-2.5 text-[13px] text-[#636366] hover:text-white smooth">
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'fadeIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-[#1c1c1e] rounded-3xl shadow-2xl w-full max-w-sm p-7" style={{ boxShadow: '0 32px 64px -16px rgba(0,0,0,0.6)', animation: 'scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
            <div className="w-12 h-12 rounded-2xl bg-red-500/12 flex items-center justify-center mx-auto mb-5 ring-1 ring-red-500/20">
              <Trash2 className="text-red-400 w-5 h-5" />
            </div>
            <h3 className="text-[17px] font-semibold text-white text-center mb-2 tracking-tight">Delete Template?</h3>
            <p className="text-[13px] text-[#636366] text-center mb-7 leading-relaxed">This cannot be undone. The template will be permanently removed from the repository.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl font-medium text-[13px] text-[#b0b0b8] bg-[#2c2c2e] hover:bg-[#3a3a3c] smooth press-sm">Cancel</button>
              <button onClick={() => deleteTemplateFromRepo(deleteConfirm)} className="flex-1 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl font-semibold text-[13px] smooth press-sm" data-testid="button-confirm-delete">Delete</button>
            </div>
          </div>
        </div>
      )}

      {showTemplatesPanel && (
        <div className="fixed inset-0 z-40 flex" style={{ animation: 'fadeIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTemplatesPanel(false)} />
          <div className="relative ml-auto w-[400px] h-full bg-[#111111] flex flex-col shadow-2xl" style={{ borderLeft: '1px solid #2c2c2e', animation: 'slideInRight 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #2c2c2e' }}>
              <div>
                <h2 className="text-[15px] font-semibold text-white tracking-tight">Template Repository</h2>
                <p className="text-[11px] text-[#636366] mt-0.5">{storedTemplates.length} templates saved</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { fetchTemplates(); }} className="p-2 rounded-lg text-[#636366] hover:text-white hover:bg-white/[0.06] smooth press-sm" title="Refresh">
                  <RefreshCw className={`w-4 h-4 ${loadingTemplates ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setShowTemplatesPanel(false)} className="p-2 rounded-lg text-[#636366] hover:text-white hover:bg-white/[0.06] smooth press-sm">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingTemplates && storedTemplates.length === 0 && (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 rounded-2xl bg-white/[0.04] animate-pulse" />
                  ))}
                </div>
              )}
              {!loadingTemplates && storedTemplates.length === 0 && (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-3xl bg-white/[0.04] ring-1 ring-white/[0.06] flex items-center justify-center mx-auto mb-4">
                    <FolderOpen className="w-7 h-7 text-[#636366]" />
                  </div>
                  <p className="text-white font-medium text-[14px] mb-1">No templates yet</p>
                  <p className="text-[#636366] text-[12px]">Create entities and publish them here</p>
                </div>
              )}
              <div className="space-y-2">
                {storedTemplates.map(template => (
                  <div key={template.id}
                    className={`rounded-2xl p-4 cursor-pointer smooth group ${editingTemplateId === template.id ? 'bg-purple-500/8 ring-1 ring-purple-500/20' : 'bg-white/[0.03] hover:bg-white/[0.06]'}`}
                    onClick={() => setSelectedRepoTemplate(selectedRepoTemplate?.id === template.id ? null : template)}
                    data-testid={`template-card-${template.id}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0 ring-1 ring-purple-500/15">
                        <Folder className="w-4.5 h-4.5 text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-white truncate">{template.name}</span>
                          {editingTemplateId === template.id && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/15 text-purple-400 rounded font-semibold shrink-0">Active</span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#636366] mt-0.5">{template.entities.length} entities · v{template.version || '1.0'}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); loadTemplateFromRepo(template); }}
                          className="px-3 py-1.5 text-[11px] font-semibold text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg smooth press-sm" data-testid={`button-load-${template.id}`}>
                          Load
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(template.id); }}
                          className="p-1.5 text-[#636366] hover:text-red-400 rounded-lg hover:bg-red-500/10 smooth press-sm opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-delete-template-${template.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {selectedRepoTemplate?.id === template.id && template.entities.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap gap-1.5">
                        {template.entities.map((e: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.06] text-[#b0b0b8]">{e.label}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {editingTemplateId && (
              <div className="p-4" style={{ borderTop: '1px solid #2c2c2e' }}>
                <button onClick={() => guardedNew(() => { startNew(); setShowTemplatesPanel(false); })} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-medium text-[#b0b0b8] bg-white/[0.04] hover:bg-white/[0.08] smooth press-sm" data-testid="button-start-new">
                  <FilePlus className="w-3.5 h-3.5" /> New Template
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <header className="h-14 shrink-0 z-20 sticky top-0 bg-black" style={{ borderBottom: '1px solid #2c2c2e' }}>
        <div className="max-w-[1400px] mx-auto w-full px-6 h-full flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard?tab=templates" className="flex items-center gap-2 text-[#98989f] hover:text-white smooth group shrink-0" data-testid="btn-back">
            <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 smooth" />
            <span className="text-[13px] font-medium tracking-wide">Back to Templates</span>
          </Link>
          <div className="w-px h-5 bg-[#2c2c2e] hidden sm:block"></div>
          <img src={logoCircle} alt="Okiru" className="h-7 w-7 rounded-[8px]" />
          <div className="h-4 w-px bg-[#2c2c2e]" />
          {isEditingProjectName ? (
            <input ref={nameInputRef} autoFocus value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={() => { setIsEditingProjectName(false); if (entities.length > 0) markDirty(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { setIsEditingProjectName(false); if (entities.length > 0) markDirty(); } }}
              className="bg-transparent border-b border-purple-500/50 text-[14px] font-semibold text-white focus:outline-none w-44 py-0.5" data-testid="input-project-name" />
          ) : (
            <button onClick={() => setIsEditingProjectName(true)} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-white/[0.05] smooth press-sm group" data-testid="button-edit-project-name">
              <span className="text-[14px] font-semibold text-white">{projectName}</span>
              <Pencil className="w-3 h-3 text-[#636366] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          <div className="flex items-center gap-1.5">
            {editingTemplateId && <span className="text-[10px] px-2 py-0.5 bg-purple-500/12 text-purple-400 rounded font-semibold">Editing</span>}
            {hasUnsavedChanges && entities.length > 0 && (
              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold flex items-center gap-1 ${editingTemplateId ? 'text-amber-400 bg-amber-500/10' : 'text-purple-400 bg-purple-500/10'}`}>
                <span className={`w-1 h-1 rounded-full animate-pulse ${editingTemplateId ? 'bg-amber-500' : 'bg-purple-500'}`} />
                {editingTemplateId ? 'Unsaved' : 'Draft'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => guardedNew(startNew)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#8e8e93] hover:text-white hover:bg-white/[0.06] rounded-lg smooth press-sm" title="New Template" data-testid="button-new-template">
            <FilePlus className="w-3.5 h-3.5" /> New
          </button>
          {savedDrafts.length > 0 && (
            <button onClick={() => setLeftTab('entities')}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 rounded-lg smooth press-sm" title="View drafts" data-testid="button-view-drafts">
              <Clock className="w-3 h-3" /> {savedDrafts.length}
            </button>
          )}
          <button onClick={exportEntities} disabled={entities.length === 0}
            className="p-2 text-[#636366] hover:text-white hover:bg-white/[0.06] rounded-lg smooth press-sm disabled:opacity-30" title="Export JSON" data-testid="button-export">
            <Download className="w-4 h-4" />
          </button>
          {hasUnsavedChanges && entities.length > 0 && (
            editingTemplateId ? (
              <button onClick={saveChanges} disabled={isSaving}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg text-[12px] font-semibold smooth press-sm" data-testid="button-save-header">
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3 h-3" />Save</>}
              </button>
            ) : (
              <button onClick={() => setShowPublishModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[12px] font-semibold smooth press-sm" data-testid="button-save-new">
                <Upload className="w-3 h-3" />Save
              </button>
            )
          )}
          <button onClick={() => entities.length > 0 && setShowPublishModal(true)} disabled={entities.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-[12px] font-semibold smooth press-sm shadow-sm shadow-purple-500/20" data-testid="button-publish">
            {editingTemplateId ? "Update" : "Publish"}
          </button>
        </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col" style={{ background: '#080808' }}>
        <div className="max-w-[1400px] mx-auto w-full px-6 py-5 flex flex-col flex-1 min-h-0">

          {/* AI Prompt Bar */}
          <div className="mb-4">
            <div className="flex gap-2.5">
              <div className="relative flex-1">
                <Sparkles className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors ${nlInput.trim() ? 'text-purple-400' : 'text-[#3a3a3c]'}`} />
                <input ref={nlInputRef} type="text" value={nlInput}
                  onChange={(e) => setNlInput(e.target.value)}
                  className="w-full bg-[#111111] text-white rounded-xl pl-10 pr-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-purple-500/25 placeholder-[#3a3a3c] smooth"
                  style={{ border: '1px solid #2c2c2e' }}
                  placeholder="Describe an entity to create — e.g. B-BBEE contributor level, certificate expiry date…"
                  onKeyDown={(e) => e.key === 'Enter' && !isGenerating && nlInput.trim() && parseNaturalLanguage()}
                  data-testid="input-nl" />
              </div>
              <button onClick={parseNaturalLanguage} disabled={isGenerating || !nlInput.trim()}
                className="shrink-0 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-[#1a1a1a] disabled:text-[#3a3a3c] text-white rounded-xl text-[12px] font-semibold smooth press-sm flex items-center gap-1.5 transition-all"
                data-testid="button-generate">
                {isGenerating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating…</> : <><Zap className="w-3.5 h-3.5" />Generate</>}
              </button>
            </div>
          </div>

          {/* Entity list + Detail — side by side */}
          <div className="flex gap-4 flex-1 min-h-0">

            {/* Left Column */}
            <div className="w-[240px] shrink-0 flex flex-col rounded-2xl overflow-hidden" style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}>
              {/* Tab switcher */}
              <div className="flex shrink-0" style={{ borderBottom: '1px solid #1e1e1e' }}>
                {(['entities', 'repository'] as const).map(tab => (
                  <button key={tab} onClick={() => setLeftTab(tab)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-colors smooth ${leftTab === tab ? 'text-white border-b-2 border-purple-500' : 'text-[#636366] hover:text-[#b0b0b8]'}`}
                    style={{ borderBottom: leftTab === tab ? '2px solid #a855f7' : '2px solid transparent' }}>
                    {tab === 'entities' ? <><Shapes className="w-3 h-3" />Entities</> : <><BookOpen className="w-3 h-3" />Repository</>}
                  </button>
                ))}
              </div>

              {/* Entities tab */}
              {leftTab === 'entities' && <>
                {entities.length > 3 && (
                  <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1e1e1e' }}>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#3a3a3c] pointer-events-none" />
                      <input type="text" value={entitySearch} onChange={(e) => setEntitySearch(e.target.value)}
                        placeholder="Filter…" className="w-full bg-transparent pl-7 pr-3 py-1.5 text-[12px] text-[#b0b0b8] placeholder-[#3a3a3c] focus:outline-none rounded-lg focus:bg-white/[0.04] transition-all" />
                    </div>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto py-2 px-2">
                  {entities.length === 0 && (
                    <div className="text-center py-10 px-3">
                      <div className="w-10 h-10 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.05] flex items-center justify-center mx-auto mb-3">
                        <Shapes className="w-4 h-4 text-[#3a3a3c]" />
                      </div>
                      <p className="text-[11px] text-[#3a3a3c] leading-relaxed">Type above to create your first entity</p>
                    </div>
                  )}
                  {filteredEntities.map((entity) => {
                    const isSelected = selectedEntityId === entity.id;
                    return (
                      <div key={entity.id}
                        onClick={() => setSelectedEntityId(entity.id)}
                        className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-0.5 cursor-pointer smooth ${isSelected ? 'bg-purple-500/12' : 'hover:bg-white/[0.04]'}`}
                        data-testid={`entity-row-${entity.id}`}>
                        {isSelected && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-purple-500" />}
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${isSelected ? 'bg-purple-500/20 text-purple-300' : 'bg-white/[0.05] text-[#636366]'}`}>
                          {entity.label.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] font-semibold truncate transition-colors ${isSelected ? 'text-white' : 'text-[#b0b0b8] group-hover:text-white'}`}>{entity.label}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); deleteEntity(entity.id); }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[#636366] hover:text-red-400 rounded-lg hover:bg-red-500/10 smooth press-sm shrink-0 transition-opacity"
                          title="Delete" data-testid={`button-delete-${entity.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {entities.length > 0 && (
                  <div className="px-3 py-2.5 shrink-0 text-[11px] text-[#636366]" style={{ borderTop: '1px solid #1e1e1e' }}>
                    {entities.length} {entities.length === 1 ? 'entity' : 'entities'}
                  </div>
                )}

                {savedDrafts.length > 0 && (
                  <div className="shrink-0" style={{ borderTop: '1px solid #1e1e1e' }}>
                    <div className="flex items-center gap-1.5 px-3 py-2">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-widest">Drafts</span>
                      <span className="ml-auto text-[10px] text-[#636366]">{savedDrafts.length}</span>
                    </div>
                    <div className="pb-2 space-y-1 px-2">
                      {savedDrafts.map(draft => (
                        <div key={draft.id} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-amber-500/[0.06] hover:bg-amber-500/10 smooth group" style={{ border: '1px solid rgba(245,158,11,0.12)' }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-[#d4a827] truncate">{draft.name}</p>
                            <p className="text-[10px] text-[#636366]">{draft.entities.length} {draft.entities.length === 1 ? 'entity' : 'entities'} · {relativeTime(draft.savedAt)}</p>
                          </div>
                          <button onClick={() => resumeDraft(draft)}
                            className="px-2 py-0.5 text-[10px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-md smooth press-sm shrink-0" data-testid={`button-resume-draft-${draft.id}`}>
                            Resume
                          </button>
                          <button onClick={() => deleteDraft(draft.id)}
                            className="p-1 text-[#636366] hover:text-red-400 smooth press-sm opacity-0 group-hover:opacity-100 shrink-0" data-testid={`button-delete-draft-${draft.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>}

              {/* Repository tab */}
              {leftTab === 'repository' && (
                <div className="flex-1 overflow-y-auto">
                  <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1e1e1e' }}>
                    <span className="text-[10px] text-[#636366]">{storedTemplates.length} saved</span>
                    <button onClick={fetchTemplates} className="p-1 text-[#636366] hover:text-white rounded-md smooth press-sm">
                      <RefreshCw className={`w-3 h-3 ${loadingTemplates ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  {loadingTemplates && storedTemplates.length === 0 && (
                    <div className="space-y-1.5 p-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />)}</div>
                  )}
                  {!loadingTemplates && storedTemplates.length === 0 && (
                    <div className="text-center py-12 px-3">
                      <FolderOpen className="w-6 h-6 text-[#3a3a3c] mx-auto mb-2" />
                      <p className="text-[11px] text-[#3a3a3c]">No saved templates</p>
                    </div>
                  )}
                  <div className="p-2 space-y-1">
                    {storedTemplates.map(tmpl => (
                      <div key={tmpl.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e1e1e' }}>
                        <div
                          className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer smooth ${expandedRepoId === tmpl.id ? 'bg-purple-500/10' : 'bg-white/[0.02] hover:bg-white/[0.05]'}`}
                          onClick={() => setExpandedRepoId(expandedRepoId === tmpl.id ? null : tmpl.id)}>
                          <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                            <Folder className="w-3.5 h-3.5 text-purple-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-white truncate">{tmpl.name}</p>
                            <p className="text-[10px] text-[#636366]">{tmpl.entities.length} entities</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); loadTemplateFromRepo(tmpl); setLeftTab('entities'); }}
                              className="px-2 py-0.5 text-[10px] font-semibold text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 rounded-md smooth press-sm" data-testid={`button-load-repo-${tmpl.id}`}>
                              Load
                            </button>
                            <ChevronDown className={`w-3 h-3 text-[#636366] transition-transform ${expandedRepoId === tmpl.id ? 'rotate-180' : ''}`} />
                          </div>
                        </div>
                        {expandedRepoId === tmpl.id && tmpl.entities.length > 0 && (
                          <div className="px-3 pb-2 pt-1 space-y-1" style={{ borderTop: '1px solid #1e1e1e' }}>
                            {tmpl.entities.map((e: any, i: number) => (
                              <div key={i} className="flex items-start gap-2 py-1.5">
                                <div className="w-5 h-5 rounded-md bg-white/[0.05] flex items-center justify-center shrink-0 mt-0.5">
                                  <span className="text-[8px] font-bold text-[#636366]">{e.label.substring(0,2).toUpperCase()}</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold text-[#b0b0b8] truncate">{e.label}</p>
                                  {e.definition && <p className="text-[9px] text-[#3a3a3c] leading-relaxed line-clamp-2">{e.definition}</p>}
                                  {e.pattern && <p className="text-[9px] text-purple-500/70 font-mono mt-0.5 truncate">{e.pattern}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Detail / Empty State Panel */}
            <div className="flex-1 min-w-0 flex flex-col rounded-2xl overflow-hidden" style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}>

              {/* Right panel tab header */}
              <div className="flex items-center gap-1 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid #1e1e1e' }}>
                {(['editor', 'test'] as const).map(tab => (
                  <button key={tab} onClick={() => setRightTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold smooth transition-colors ${rightTab === tab ? 'bg-white/[0.08] text-white' : 'text-[#636366] hover:text-[#b0b0b8]'}`}>
                    {tab === 'editor' ? <><Pencil className="w-3 h-3" />Editor</> : <><FlaskConical className="w-3 h-3" />Live Test</>}
                  </button>
                ))}
              </div>

              {/* Editor tab */}
              {rightTab === 'editor' && !selectedEntity && (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                  <div className="w-16 h-16 rounded-3xl bg-white/[0.03] ring-1 ring-white/[0.04] flex items-center justify-center mx-auto mb-5">
                    <Shapes className="w-7 h-7 text-[#2c2c2e]" />
                  </div>
                  <p className="text-[16px] font-semibold text-white tracking-tight mb-2">
                    {entities.length === 0 ? 'No entities yet' : 'Select an entity'}
                  </p>
                  <p className="text-[13px] text-[#3a3a3c] leading-relaxed max-w-xs">
                    {entities.length === 0
                      ? <>Type a concept above — like <span className="text-purple-500">price</span>, <span className="text-purple-500">date</span>, or <span className="text-purple-500">BEE level</span> — and AI will build the entity for you.</>
                      : 'Click any entity in the list to view and edit its details.'}
                  </p>
                </div>
              )}

              {/* Live Test tab */}
              {rightTab === 'test' && (
                <div className="flex-1 min-h-0 flex flex-col">
                  {/* Controls row */}
                  <div className="px-5 py-3 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid #1e1e1e' }}>
                    <div className="flex-1 relative" ref={testTemplateDropRef}>
                      <label className="text-[10px] text-[#636366] font-semibold uppercase tracking-widest block mb-1">Template</label>
                      <button onClick={() => setTestTemplateDropOpen(o => !o)}
                        className="w-full flex items-center justify-between bg-[#1c1c1e] text-white text-[12px] rounded-lg px-3 py-1.5 border border-[#2c2c2e] hover:border-[#48484a] smooth text-left"
                        data-testid="select-test-template">
                        <span className="truncate">
                          {testTemplateId === 'current'
                            ? `Current build (${entities.length} entities)`
                            : (() => { const t = storedTemplates.find(t => t.id === testTemplateId); return t ? `${t.name} (${t.entities.length})` : 'Template'; })()}
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 shrink-0 ml-2 text-[#636366] transition-transform duration-150 ${testTemplateDropOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {testTemplateDropOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50"
                          style={{ background: '#1c1c1e', border: '1px solid #2c2c2e', boxShadow: '0 16px 32px rgba(0,0,0,0.5)' }}>
                          <div onClick={() => { setTestTemplateId('current'); setTestTemplateDropOpen(false); }}
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer smooth text-[12px] ${testTemplateId === 'current' ? 'bg-purple-500/15 text-purple-300' : 'text-[#e5e5e7] hover:bg-white/[0.05]'}`}>
                            <span className="flex-1 truncate">Current build</span>
                            <span className="text-[11px] text-[#636366] shrink-0">({entities.length} entities)</span>
                            {testTemplateId === 'current' && <Check className="w-3 h-3 text-purple-400 shrink-0" />}
                          </div>
                          {storedTemplates.length > 0 && <div style={{ borderTop: '1px solid #2c2c2e' }} />}
                          {storedTemplates.map(t => (
                            <div key={t.id} onClick={() => { setTestTemplateId(t.id); setTestTemplateDropOpen(false); }}
                              className={`flex items-center gap-2 px-3 py-2 cursor-pointer smooth text-[12px] ${testTemplateId === t.id ? 'bg-purple-500/15 text-purple-300' : 'text-[#e5e5e7] hover:bg-white/[0.05]'}`}>
                              <span className="flex-1 truncate">{t.name}</span>
                              <span className="text-[11px] text-[#636366] shrink-0">({t.entities.length})</span>
                              {testTemplateId === t.id && <Check className="w-3 h-3 text-purple-400 shrink-0" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={runTest} disabled={isTesting || !testText.trim() || (testTemplateId === 'current' && entities.length === 0)}
                      className="mt-5 flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-[12px] font-semibold smooth press-sm"
                      data-testid="button-run-test">
                      {isTesting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Testing…</> : <><Play className="w-3.5 h-3.5" />Run</>}
                    </button>
                  </div>
                  {/* Two-column: text input + results */}
                  <div className="flex flex-1 min-h-0">
                    {/* Text input */}
                    <div className="w-1/2 flex flex-col" style={{ borderRight: '1px solid #1e1e1e' }}>
                      <div className="px-4 py-2 shrink-0" style={{ borderBottom: '1px solid #1e1e1e' }}>
                        <span className="text-[10px] text-[#636366] font-semibold uppercase tracking-widest"><span className="underline">Document text</span></span>
                      </div>
                      <textarea
                        value={testText}
                        onChange={(e) => setTestText(e.target.value)}
                        placeholder="Paste or type document text here to test extraction…"
                        className="flex-1 w-full bg-transparent text-[13px] text-white resize-none p-4 focus:outline-none placeholder:text-[#3a3a3c] leading-relaxed font-mono"
                        data-testid="textarea-test-input"
                      />
                      <div className="px-4 py-2 shrink-0 flex items-center justify-between" style={{ borderTop: '1px solid #1e1e1e' }}>
                        <span className="text-[10px] text-[#3a3a3c]">{testText.length.toLocaleString()} chars</span>
                        {testText && <button onClick={() => { setTestText(''); setTestResults([]); }} className="text-[10px] text-[#636366] hover:text-white smooth">Clear</button>}
                      </div>
                    </div>
                    {/* Results */}
                    <div className="w-1/2 flex flex-col overflow-hidden">
                      <div className="px-4 py-2 shrink-0 flex items-center justify-between" style={{ borderBottom: '1px solid #1e1e1e' }}>
                        <span className="text-[10px] text-[#636366] font-semibold uppercase tracking-widest">Results</span>
                        {testResults.length > 0 && (
                          <span className="text-[10px] text-[#636366]">
                            {testResults.filter(r => r.status === 'extracted').length}/{testResults.length} <span className="underline">found</span>
                          </span>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                        {testResults.length === 0 && !isTesting && (
                          <div className="flex flex-col items-center justify-center h-full text-center py-12">
                            <FlaskConical className="w-8 h-8 text-[#2c2c2e] mb-3" />
                            <p className="text-[12px] text-[#3a3a3c]">Paste text and click Run</p>
                          </div>
                        )}
                        {isTesting && testResults.length === 0 && (
                          <div className="flex flex-col items-center justify-center h-full py-12">
                            <Loader2 className="w-6 h-6 text-purple-400 animate-spin mb-2" />
                            <p className="text-[12px] text-[#636366]">Extracting…</p>
                          </div>
                        )}
                        {testResults.map((r, i) => (
                          <div key={i} className={`rounded-xl p-3 ${r.status === 'extracted' ? 'bg-[#1c1c1e]' : 'bg-[#111111] opacity-50'}`} style={{ border: `1px solid ${r.status === 'extracted' ? '#2c2c2e' : '#1e1e1e'}` }}>
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.status === 'extracted' ? 'bg-emerald-400' : 'bg-[#3a3a3c]'}`} />
                              <span className="text-[10px] font-semibold text-[#8e8e93] uppercase tracking-widest">{r.name}</span>
                              {r.status === 'extracted' && (
                                <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-md font-semibold ${r.method === 'Pattern' ? 'bg-purple-500/15 text-purple-400' : 'bg-[#2c2c2e] text-[#636366]'}`}>
                                  {r.method}
                                </span>
                              )}
                            </div>
                            {r.status === 'extracted' ? (
                              <p className="text-[12px] text-white leading-relaxed pl-3.5 line-clamp-3">{r.value}</p>
                            ) : (
                              <p className="text-[11px] text-[#3a3a3c] pl-3.5 italic">Not found</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {rightTab === 'editor' && selectedEntity && (
                <div className="flex-1 overflow-y-auto">
                  <div className="px-6 py-5 sticky top-0 z-10 shrink-0" style={{ background: '#0d0d0d', borderBottom: '1px solid #1e1e1e' }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={selectedEntity.label}
                          onChange={(e) => updateEntity(selectedEntity.id, 'label', e.target.value)}
                          className="w-full bg-transparent text-[20px] font-semibold text-white tracking-tight focus:outline-none placeholder-[#3a3a3c]"
                          placeholder="Entity label"
                          data-testid={`input-label-${selectedEntity.id}`}
                        />
                        <p className="text-[11px] text-[#3a3a3c] mt-0.5">Entity #{selectedEntity.id.toString().slice(-4)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => duplicateEntity(selectedEntity.id)}
                          className="p-2 text-[#636366] hover:text-white hover:bg-white/[0.06] rounded-xl smooth press-sm" title="Duplicate" data-testid={`button-duplicate-${selectedEntity.id}`}>
                          <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteEntity(selectedEntity.id)}
                          className="p-2 text-[#636366] hover:text-red-400 hover:bg-red-500/10 rounded-xl smooth press-sm" title="Delete" data-testid={`button-delete-header-${selectedEntity.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-5 space-y-7">
                <Section title="Definition" icon={<AlignLeft className="w-3.5 h-3.5" />}>
                  <textarea
                    className="w-full bg-[#111111] text-[13px] text-white rounded-2xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500/20 resize-none leading-relaxed placeholder-[#3a3a3c]"
                    style={{ border: '1px solid #1e1e1e' }}
                    rows={3}
                    placeholder="Describe what this entity represents and when it appears in documents…"
                    value={selectedEntity.definition}
                    onChange={(e) => updateEntity(selectedEntity.id, 'definition', e.target.value)}
                    data-testid={`input-definition-${selectedEntity.id}`}
                  />
                </Section>

                <Section title="Pattern" icon={<Code className="w-3.5 h-3.5" />} hint="Regex to match — e.g. INV-\d{4}">
                  <input
                    type="text"
                    className="w-full bg-[#111111] text-[13px] text-white font-mono rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/20 placeholder-[#3a3a3c]"
                    style={{ border: '1px solid #1e1e1e' }}
                    placeholder='e.g. INV-\d{4} or \d{4}-\d{2}-\d{2}'
                    value={selectedEntity.pattern}
                    onChange={(e) => updateEntity(selectedEntity.id, 'pattern', e.target.value)}
                    data-testid={`input-pattern-${selectedEntity.id}`}
                  />
                </Section>

                <Section title="Synonyms" icon={<Tags className="w-3.5 h-3.5" />} hint="Other names for this entity">
                  <TagField
                    items={selectedEntity.synonyms}
                    onAdd={(v) => addItem(selectedEntity.id, 'synonyms', v)}
                    onRemove={(i) => removeItem(selectedEntity.id, 'synonyms', i)}
                    placeholder="Add synonym…"
                    color="blue"
                  />
                </Section>

                <div className="grid grid-cols-2 gap-6">
                  <Section title="Positive Examples" icon={<Check className="w-3.5 h-3.5 text-emerald-500" />} hint="Values that should match">
                    <TagField
                      items={selectedEntity.positives}
                      onAdd={(v) => addItem(selectedEntity.id, 'positives', v)}
                      onRemove={(i) => removeItem(selectedEntity.id, 'positives', i)}
                      placeholder="Add example…"
                      color="green"
                    />
                  </Section>
                  <Section title="Negative Examples" icon={<X className="w-3.5 h-3.5 text-red-500" />} hint="Values that should not match">
                    <TagField
                      items={selectedEntity.negatives}
                      onAdd={(v) => addItem(selectedEntity.id, 'negatives', v)}
                      onRemove={(i) => removeItem(selectedEntity.id, 'negatives', i)}
                      placeholder="Add anti-example…"
                      color="red"
                    />
                  </Section>
                </div>

                <Section title="Document Zones" icon={<Map className="w-3.5 h-3.5" />} hint="Where to look in the document">
                  <div className="flex flex-wrap gap-2">
                    {["Email Subject", "Email Body", "PDF Header", "Tables", "Footer", "Signature Block"].map(zone => (
                      <button key={zone} onClick={() => toggleZone(selectedEntity.id, zone)}
                        className={`px-3.5 py-2 rounded-xl text-[12px] font-medium smooth press-sm transition-all ${selectedEntity.zones.includes(zone)
                          ? 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/25'
                          : 'bg-[#111111] text-[#636666] ring-1 ring-white/[0.06] hover:ring-white/[0.12] hover:text-[#b0b0b8]'}`}>
                        {zone}
                      </button>
                    ))}
                  </div>
                </Section>

                <Section title="Keywords" icon={<Sparkles className="w-3.5 h-3.5" />} hint="Guide extraction accuracy">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-widest mb-2">Must have</p>
                      <TagField
                        items={selectedEntity.keywords.must}
                        onAdd={(v) => addKeyword(selectedEntity.id, 'must', v)}
                        onRemove={(i) => removeKeyword(selectedEntity.id, 'must', i)}
                        placeholder="Add…" color="green" compact />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-widest mb-2">Nice to have</p>
                      <TagField
                        items={selectedEntity.keywords.nice}
                        onAdd={(v) => addKeyword(selectedEntity.id, 'nice', v)}
                        onRemove={(i) => removeKeyword(selectedEntity.id, 'nice', i)}
                        placeholder="Add…" color="blue" compact />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-red-400 uppercase tracking-widest mb-2">Exclude</p>
                      <TagField
                        items={selectedEntity.keywords.neg}
                        onAdd={(v) => addKeyword(selectedEntity.id, 'neg', v)}
                        onRemove={(i) => removeKeyword(selectedEntity.id, 'neg', i)}
                        placeholder="Add…" color="red" compact />
                    </div>
                  </div>
                </Section>

                <Section title="Completeness" icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { check: selectedEntity.definition.length > 10, text: "Definition", sub: "Required" },
                      { check: selectedEntity.positives.length > 0, text: "Positives", sub: `${selectedEntity.positives.length} added` },
                      { check: selectedEntity.negatives.length > 0, text: "Negatives", sub: `${selectedEntity.negatives.length} added` },
                      { check: selectedEntity.synonyms.length > 0, text: "Synonyms", sub: `${selectedEntity.synonyms.length} added` },
                      { check: selectedEntity.zones.length > 0, text: "Zones", sub: `${selectedEntity.zones.length} selected` },
                      { check: !!selectedEntity.pattern, text: "Pattern", sub: "Regex" },
                    ].map((item, i) => (
                      <div key={i} className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[12px] transition-all ${item.check ? 'bg-emerald-500/6 ring-1 ring-emerald-500/12' : 'bg-[#111111] ring-1 ring-white/[0.04]'}`}>
                        {item.check
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          : <div className="w-3.5 h-3.5 rounded-full border border-[#3a3a3c] shrink-0" />}
                        <div className="min-w-0">
                          <p className={`font-medium truncate ${item.check ? 'text-white' : 'text-[#636366]'}`}>{item.text}</p>
                          <p className={`text-[10px] ${item.check ? 'text-[#636366]' : 'text-[#2c2c2e]'}`}>{item.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                <div className="h-8" />
                </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        input, textarea { cursor: text !important; user-select: text !important; }
        button, a { cursor: pointer !important; user-select: none !important; }
      `}</style>
    </div>
  );
}

function Section({ title, icon, hint, children }: { title: string; icon?: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-[#636366]">{icon}</span>}
        <span className="text-[11px] font-semibold text-[#636366] uppercase tracking-widest">{title}</span>
        {hint && <span className="text-[10px] text-[#2c2c2e] ml-1">— {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function TagField({ items, onAdd, onRemove, placeholder, color, compact }: {
  items: string[]; onAdd: (v: string) => void; onRemove: (i: number) => void;
  placeholder: string; color: string; compact?: boolean;
}) {
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    blue:  { bg: 'bg-purple-500/10', text: 'text-purple-300', ring: 'ring-purple-500/15' },
    green: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', ring: 'ring-emerald-500/15' },
    red:   { bg: 'bg-red-500/10', text: 'text-red-300', ring: 'ring-red-500/15' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`flex flex-wrap gap-1.5 bg-[#111111] rounded-2xl px-3 ${compact ? 'py-2.5 min-h-[48px]' : 'py-3 min-h-[52px]'} items-center focus-within:ring-2 focus-within:ring-purple-500/20 transition-all`}
      style={{ border: '1px solid #1e1e1e' }}>
      {items.map((item: string, i: number) => (
        <span key={i} className={`${c.bg} ${c.text} text-[11px] px-2.5 py-1 rounded-lg ring-1 ${c.ring} flex items-center gap-1.5 font-medium`}>
          {item}
          <button onClick={() => onRemove(i)} className="opacity-40 hover:opacity-100 transition-opacity hover:text-white">
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        type="text"
        className="bg-transparent border-none outline-none text-[12px] text-white flex-1 min-w-[80px] placeholder-[#2c2c2e]"
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
            onAdd(e.currentTarget.value.trim());
            e.currentTarget.value = '';
            e.preventDefault();
          }
        }}
      />
    </div>
  );
}
