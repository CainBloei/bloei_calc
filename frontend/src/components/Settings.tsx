import React, { useState, useRef, useEffect } from 'react';
import { Settings as SettingsIcon, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeMode } from '../contexts/ThemeContext';

const options: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Licht', icon: <Sun size={18} /> },
  { value: 'dark', label: 'Donker', icon: <Moon size={18} /> },
  { value: 'system', label: 'Automatisch', icon: <Monitor size={18} /> },
];

export function Settings() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 cursor-pointer dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-neutral-800 transition-colors"
        aria-label="Instellingen"
      >
        <SettingsIcon size={20} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 bottom-full mb-2 w-56 bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-gray-200 dark:border-neutral-700 py-2 z-50"
        >
          <div className="px-4 py-2 border-b border-gray-100 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Instellingen
            </h3>
          </div>
          <div className="px-2 py-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 px-2 mb-2">
              Thema
            </p>
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setTheme(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  theme === opt.value
                    ? 'bg-bloei-petrol/10 text-bloei-petrol dark:text-bloei-petrol'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 cursor-pointer dark:hover:bg-neutral-800'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
