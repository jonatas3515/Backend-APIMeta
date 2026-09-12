import { useState } from 'react';
import LgpdDeletionRequestModal from './LgpdDeletionRequestModal';

export default function LgpdDeletionRequestButton({ clientId }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="nc-btn text-xs py-1.5 w-full"
        aria-label="Solicitar exclusão ou anonimização de dados (LGPD)"
      >
        🗑️ Excluir/Anonimizar Dados (LGPD)
      </button>
      {open && (
        <LgpdDeletionRequestModal
          clientId={clientId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
