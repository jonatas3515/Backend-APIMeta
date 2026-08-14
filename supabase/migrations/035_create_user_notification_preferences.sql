-- ============================================================================
-- MIGRATION 035: Preferências de notificações do usuário
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  ask_again_after TIMESTAMP WITH TIME ZONE,
  notify_messages BOOLEAN NOT NULL DEFAULT true,
  notify_deadlines BOOLEAN NOT NULL DEFAULT true,
  notify_assignments BOOLEAN NOT NULL DEFAULT true,
  notify_reminders BOOLEAN NOT NULL DEFAULT true,
  notify_checklist BOOLEAN NOT NULL DEFAULT false,
  silent_start TIME,
  silent_end TIME,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id)
);

COMMENT ON TABLE user_notification_preferences IS 'Preferências individuais de notificações push por usuário';

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id
  ON user_notification_preferences(user_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_user_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_notification_preferences_updated_at ON user_notification_preferences;
CREATE TRIGGER trigger_user_notification_preferences_updated_at
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_notification_preferences_updated_at();

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
