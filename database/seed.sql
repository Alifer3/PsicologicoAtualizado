-- PsicoConnect - Dados iniciais para teste
-- Senhas: todas são '123456' com hash bcrypt (custo 10)

INSERT INTO planos (nome, valor, descricao) VALUES
('Básico', 29.90, 'Plano inicial para psicólogos'),
('Profissional', 49.90, 'Plano intermediário com mais recursos'),
('Premium', 79.90, 'Plano completo')
ON CONFLICT (nome) DO NOTHING;

-- Usuários demo (senha 123456 = hash bcrypt abaixo)
INSERT INTO usuarios (nome, email, senha_hash, telefone, tipo) VALUES
('Dra. Ana Souza', 'ana.psicologa@psicoconnect.com', '$2a$10$8KxX2Gx7J5yQZ5K1YqE8eO1l3Q5eR8tV6w9X0y2Z4B7n5M3p1S6u2', '(45) 99999-0001', 'psicologo'),
('Carlos Lima', 'carlos.paciente@psicoconnect.com', '$2a$10$8KxX2Gx7J5yQZ5K1YqE8eO1l3Q5eR8tV6w9X0y2Z4B7n5M3p1S6u2', '(45) 99999-0002', 'paciente'),
('Administrador', 'admin@psicoconnect.com', '$2a$10$8KxX2Gx7J5yQZ5K1YqE8eO1l3Q5eR8tV6w9X0y2Z4B7n5M3p1S6u2', '(45) 99999-0003', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO psicologos (usuario_id, crp, especialidade, bio, valor_consulta, atende_online, atende_presencial, status_validacao)
SELECT id, '08/12345', 'Ansiedade e Burnout', 'Atendimento psicológico com foco em saúde mental e estresse ocupacional.', 120.00, TRUE, TRUE, 'aprovado'
FROM usuarios WHERE email = 'ana.psicologa@psicoconnect.com'
ON CONFLICT (crp) DO NOTHING;

INSERT INTO pacientes (usuario_id, data_nascimento, genero, observacoes)
SELECT id, '2000-05-10', 'Masculino', 'Paciente de teste'
FROM usuarios WHERE email = 'carlos.paciente@psicoconnect.com'
ON CONFLICT (usuario_id) DO NOTHING;

INSERT INTO enderecos (psicologo_id, cep, logradouro, numero, bairro, cidade, estado, latitude, longitude)
SELECT p.id, '85800-000', 'Rua Paraná', '1000', 'Centro', 'Cascavel', 'PR', -24.9555, -53.4552
FROM psicologos p WHERE p.crp = '08/12345';
