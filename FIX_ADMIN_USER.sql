-- ============================================================================
-- FIX: Vincular usuário como Admin
-- ============================================================================
-- Execute este arquivo no Supabase SQL Editor para vincular o usuário como admin
-- ============================================================================

-- 1. Primeiro, encontre o auth_user_id do usuário que fez login
-- Você pode encontrar isso em: Supabase Dashboard → Authentication → Users
-- Copie o UID do usuário jonatascosta.adv@gmail.com

-- 2. Execute este comando substituindo 'SEU_AUTH_USER_ID' pelo UID real:

UPDATE users 
SET 
  role = 'admin',
  is_active = true,
  name = 'Jonatas Costa'
WHERE email = 'jonatascosta.adv@gmail.com';

-- 3. Se o usuário não existir na tabela users, crie com:

INSERT INTO users (name, email, role, is_active, auth_user_id)
VALUES ('Jonatas Costa', 'jonatascosta.adv@gmail.com', 'admin', true, 'SEU_AUTH_USER_ID')
ON CONFLICT (email) DO UPDATE SET
  role = 'admin',
  is_active = true,
  name = 'Jonatas Costa';

-- 4. Verifique se funcionou:

SELECT id, name, email, role, is_active, auth_user_id FROM users WHERE email = 'jonatascosta.adv@gmail.com';
