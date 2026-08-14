import React, { useCallback, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { Check, Copy, Loader2 } from 'lucide-react';

interface CopyableSectionProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  copyMode?: 'image' | 'table';
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'sectie';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return false;
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': Promise.resolve(blob) }),
    ]);
    return true;
  } catch {
    return false;
  }
}

function cellPlainText(cell: HTMLTableCellElement): string {
  return (cell.innerText || cell.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function serializeTable(table: HTMLTableElement): { html: string; tsv: string } {
  const clone = table.cloneNode(true) as HTMLTableElement;
  clone.querySelectorAll('[data-copy-ignore]').forEach((el) => el.remove());

  const rows = Array.from(clone.querySelectorAll('tr'));
  const tsvLines: string[] = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('th, td'));
    tsvLines.push(cells.map((c) => cellPlainText(c as HTMLTableCellElement)).join('\t'));
  }

  return {
    html: `<table>${clone.innerHTML}</table>`,
    tsv: tsvLines.join('\n'),
  };
}

async function copyTableToClipboard(table: HTMLTableElement): Promise<boolean> {
  const { html, tsv } = serializeTable(table);

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
        }),
      ]);
      return true;
    } catch {
      // Fall through to writeText
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(tsv);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export const CopyableSection: React.FC<CopyableSectionProps> = ({
  label,
  children,
  className = '',
  copyMode = 'image',
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');

  const handleCopy = useCallback(async () => {
    const root = rootRef.current;
    if (!root || status === 'copying') return;

    setStatus('copying');

    try {
      if (copyMode === 'table') {
        const table = root.querySelector('table');
        if (!table) {
          setStatus('error');
          return;
        }
        const copied = await copyTableToClipboard(table);
        setStatus(copied ? 'copied' : 'error');
        return;
      }

      const card =
        Array.from(root.children).find(
          (el): el is HTMLElement =>
            el instanceof HTMLElement && !el.hasAttribute('data-copy-ignore'),
        ) ?? root;
      const expanded = root.querySelectorAll<HTMLElement>('[data-copy-expand]');
      const previous: Array<{ el: HTMLElement; maxHeight: string; overflow: string }> = [];

      const pushStyle = (el: HTMLElement) => {
        previous.push({
          el,
          maxHeight: el.style.maxHeight,
          overflow: el.style.overflow,
        });
        el.style.maxHeight = 'none';
        el.style.overflow = 'visible';
      };

      pushStyle(card);
      expanded.forEach(pushStyle);

      try {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        const isDark = document.documentElement.classList.contains('dark');
        const width = Math.max(card.scrollWidth, card.offsetWidth);
        const height = Math.max(card.scrollHeight, card.offsetHeight);

        const blob = await toBlob(card, {
          pixelRatio: 2,
          cacheBust: true,
          width,
          height,
          backgroundColor: isDark ? '#000000' : '#ffffff',
          filter: (node) => !node.hasAttribute?.('data-copy-ignore'),
        });

        if (!blob) {
          setStatus('error');
          return;
        }

        const copied = await copyBlobToClipboard(blob);
        if (!copied) {
          downloadBlob(blob, `${slugify(label)}.png`);
        }
        setStatus('copied');
      } finally {
        previous.forEach(({ el, maxHeight, overflow }) => {
          el.style.maxHeight = maxHeight;
          el.style.overflow = overflow;
        });
      }
    } catch {
      setStatus('error');
    } finally {
      window.setTimeout(() => setStatus('idle'), 2000);
    }
  }, [copyMode, label, status]);

  const feedback =
    status === 'copied' ? 'Gekopieerd' : status === 'error' ? 'Kopiëren mislukt' : null;

  return (
    <div ref={rootRef} className={`relative group ${className}`}>
      <button
        type="button"
        data-copy-ignore
        onClick={handleCopy}
        disabled={status === 'copying'}
        aria-label={`Kopieer ${label}`}
        title={`Kopieer ${label}`}
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/95 px-2 py-1.5 text-xs font-medium text-gray-600 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-900/95 dark:text-gray-200 dark:hover:bg-neutral-800 cursor-pointer disabled:cursor-wait"
      >
        {status === 'copying' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : status === 'copied' ? (
          <Check size={14} className="text-green-600" />
        ) : (
          <Copy size={14} />
        )}
        {feedback && <span>{feedback}</span>}
      </button>
      {children}
    </div>
  );
};
