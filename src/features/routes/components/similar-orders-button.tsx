"use client";

import { useState } from "react";
import { LayersIcon, ExternalLinkIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/platform/web/components/ui/dialog";

interface SimilarOrdersButtonProps {
  similarCount: number;
  similarOrderIds: string[];
  orderUrlTemplate?: string;
}

export function SimilarOrdersButton({ similarCount, similarOrderIds, orderUrlTemplate }: SimilarOrdersButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-primary transition-colors"
        title={`${similarCount} identical runs available`}
      >
        <LayersIcon className="h-3.5 w-3.5" />
        <span>{similarCount} identical</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{similarCount} Identical Runs Available</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Same origin, destination, and trailer type. Call the broker with any of these order IDs if the primary is taken.
          </p>
          <ul className="mt-2 space-y-1">
            {similarOrderIds.map((id) => {
              const url = orderUrlTemplate ? orderUrlTemplate.replace("{{ORDER_ID}}", id) : null;
              return (
                <li key={id}>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-between font-mono text-sm text-primary bg-muted px-3 py-1.5 rounded hover:bg-muted/80 transition-colors"
                    >
                      {id}
                      <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0 ml-2" />
                    </a>
                  ) : (
                    <span className="block font-mono text-sm text-foreground bg-muted px-3 py-1.5 rounded">{id}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
