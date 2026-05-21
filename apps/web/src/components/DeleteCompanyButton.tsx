import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@toolkit/lib/auth";
import { API_BASE } from "@toolkit/lib/config";
import { useToast } from "@/hooks/use-toast";
import { isSuperAdmin } from "@/lib/roles";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DeleteCompanyButtonProps = {
  companyId: string;
  companyName: string;
  createdByUserId?: string | null;
  onDeleted: () => void;
  className?: string;
  "data-testid"?: string;
};

export function DeleteCompanyButton({
  companyId,
  companyName,
  createdByUserId,
  onDeleted,
  className = "",
  "data-testid": testId,
}: DeleteCompanyButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canDelete =
    isSuperAdmin(user) ||
    (!!user?.id && !!createdByUserId && createdByUserId === user.id);

  if (!canDelete) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${encodeURIComponent(companyId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Could not delete company",
          description: (err as { error?: string }).error || "Server error.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Company deleted", description: companyName });
      setOpen(false);
      onDeleted();
    } catch {
      toast({
        title: "Could not delete company",
        description: "Network error.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`p-2 rounded-lg text-[#636366] hover:text-red-400 hover:bg-red-500/10 smooth press-sm shrink-0 ${className}`}
        title={`Delete ${companyName}`}
        aria-label={`Delete ${companyName}`}
        data-testid={testId ?? `button-delete-company-${companyId}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="bg-[#1c1c1e] border-[#2c2c2e] text-white max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete {companyName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#98989f]">
              This cannot be undone. The company record and its workbook data will be
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className="border-[#2c2c2e] bg-transparent text-[#d1d1d6] hover:bg-[#2c2c2e]"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
