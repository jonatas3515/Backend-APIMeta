import { useEffect, useRef } from 'react';

export function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase();
  const isEditable = target.isContentEditable;
  return (
    isEditable ||
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select'
  );
}

function normalizeKey(e) {
  if (e.ctrlKey || e.metaKey) return null; // ignoramos atalhos com Ctrl/Cmd, exceto os próprios combos
  const key = e.key;
  if (key.length === 1) return key.toLowerCase();
  if (key === 'Escape') return 'esc';
  if (key === 'Delete') return 'delete';
  if (key === 'Enter') return 'enter';
  if (key === '?') return '?';
  return key.toLowerCase();
}

export function useKeyboardShortcuts(shortcuts = []) {
  const bufferRef = useRef([]);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.repeat) return;

      const target = e.target;
      const normalized = normalizeKey(e);
      if (!normalized) return;

      // Não dispara atalhos enquanto o usuário digita em campos editáveis
      // Exceto Esc e Enter, que podem ter comportamentos específicos
      if (isTypingTarget(target) && !['esc', 'enter'].includes(normalized)) {
        return;
      }

      bufferRef.current.push(normalized);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        bufferRef.current = [];
      }, 500);

      // Ordena atalhos: os de sequência (mais chaves) primeiro para prioridade
      const sorted = [...shortcuts].sort((a, b) => (b.keys?.length || 0) - (a.keys?.length || 0));

      for (const shortcut of sorted) {
        if (shortcut.condition && !shortcut.condition(e, target)) continue;

        const keys = shortcut.keys || [];
        if (keys.length === 0) continue;

        const buffer = bufferRef.current;
        const last = buffer.slice(-keys.length);
        if (last.length === keys.length && last.every((k, i) => k === keys[i])) {
          e.preventDefault();
          if (shortcut.preventBufferReset) {
            // nada
          } else {
            bufferRef.current = [];
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
          }
          shortcut.handler(e);
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [shortcuts]);
}
