-- Adiciona campo de notas internas para atendimento
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS internal_note TEXT;
