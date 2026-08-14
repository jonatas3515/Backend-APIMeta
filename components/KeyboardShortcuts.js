import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import KeyboardShortcutsHelp from './KeyboardShortcutsHelp';

export default function KeyboardShortcuts() {
  const router = useRouter();
  const { profile } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);

  const handleGlobalShortcut = (handler) => (e) => {
    e.preventDefault();
    handler();
  };

  const shortcuts = [
    {
      keys: ['?'],
      handler: handleGlobalShortcut(() => setHelpOpen(true)),
    },
    {
      keys: ['d'],
      handler: handleGlobalShortcut(() => router.push('/dashboard')),
    },
    {
      keys: ['a'],
      handler: handleGlobalShortcut(() => router.push('/?tab=agenda')),
    },
    {
      keys: ['c'],
      handler: handleGlobalShortcut(() => router.push('/?tab=chat&new=1')),
    },
    {
      keys: ['n'],
      handler: handleGlobalShortcut(() => router.push('/?tab=cases&new=1')),
    },
    {
      keys: ['t'],
      handler: handleGlobalShortcut(() => router.push('/?tab=templates&focus=search')),
    },
    {
      keys: ['k'],
      handler: handleGlobalShortcut(() => {
        window.dispatchEvent(new CustomEvent('nc:open-global-search'));
      }),
    },
  ];

  useKeyboardShortcuts(shortcuts);

  return (
    <>
      <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
