import { useState } from 'react';
import LgpdExportModal from './LgpdExportModal';

export default function LgpdExportButton({ clientId, clientName }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Exportar dados do cliente conforme a LGPD"
        className="nc-btn text-xs py-2 w-full"
      >
        📄 Exportar Dados (LGPD)
      </button>
      {open && (
        <LgpdExportModal
          clientId={clientId}
          clientName={clientName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
