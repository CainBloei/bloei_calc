import React, { useCallback, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { Check, Copy, Loader2 } from 'lucide-react';

interface CopyableSectionProps {
  label: string;
  children: React.ReactNode;
  className?: string;
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

export const CopyableSection: React.FC<CopyableSectionProps> = ({
  label,
  children,
  className = '',
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');

  const handleCopy = useCallback(async () => {
    const root = rootRef.current;
    if (!root || status === 'copying') return;

    setStatus('copying');
    const expanded = root.querySelectorAll<HTMLElement>('[data-copy-expand]');
    const previous: Array<{ el: HTMLElement; maxHeight: string; overflow: string }> = [];
    expanded.forEach((el) => {
      previous.push({
        el,
        maxHeight: el.style.maxHeight,
        overflow: el.style.overflow,
      });
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';
    });

    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const isDark = document.documentElement.classList.contains('dark');
      const blob = await toBlob(root, {
        pixelRatio: 2,
        cacheBust: true,
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
    } catch {
      setStatus('error');
    } finally {
      previous.forEach(({ el, maxHeight, overflow }) => {
        el.style.maxHeight = maxHeight;
        el.style.overflow = overflow;
      });
      window.setTimeout(() => setStatus('idle'), 2000);
    }
  }, [label, status]);

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
