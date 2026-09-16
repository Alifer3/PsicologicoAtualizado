-- PsicoConnect - Banco PostgreSQL
-- Rode este arquivo no Render PostgreSQL antes de testar a API.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  senha_hash TEXT,
  telefone VARCHAR(30),
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('paciente', 'psicologo', 'admin')),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pacientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  data_nascimento DATE,
  genero VARCHAR(40),
  observacoes TEXT
);

CREATE TABLE IF NOT EXISTS psicologos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  crp VARCHAR(30) UNIQUE NOT NULL,
  especialidade VARCHAR(120),
  bio TEXT,
  valor_consulta NUMERIC(10,2) DEFAULT 0,
  atende_online BOOLEAN DEFAULT TRUE,
  atende_presencial BOOLEAN DEFAULT FALSE,
  status_validacao VARCHAR(30) DEFAULT 'pendente' CHECK (status_validacao IN ('pendente', 'aprovado', 'reprovado')),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enderecos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  psicologo_id UUID REFERENCES psicologos(id) ON DELETE CASCADE,
  cep VARCHAR(20),
  logradouro VARCHAR(180),
  numero VARCHAR(20),
  bairro VARCHAR(100),
  cidade VARCHAR(100),
  estado VARCHAR(2),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7)
);

CREATE TABLE IF NOT EXISTS planos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(80) NOT NULL UNIQUE,
  valor NUMERIC(10,2) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS assinaturas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  psicologo_id UUID REFERENCES psicologos(id) ON DELETE CASCADE,
  plano_id UUID REFERENCES planos(id),
  status VARCHAR(30) DEFAULT 'ativa' CHECK (status IN ('ativa','pendente','cancelada','vencida')),
  gateway VARCHAR(50),
  transacao_id VARCHAR(150),
  inicio DATE DEFAULT CURRENT_DATE,
  fim DATE
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  psicologo_id UUID REFERENCES psicologos(id) ON DELETE CASCADE,
  data_hora TIMESTAMP NOT NULL,
  modalidade VARCHAR(30) NOT NULL CHECK (modalidade IN ('online','presencial')),
  status VARCHAR(30) DEFAULT 'agendado' CHECK (status IN ('agendado','confirmado','cancelado','concluido')),
  link_meet TEXT,
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS triagens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  queixa_principal TEXT,
  historico_saude TEXT,
  uso_medicamentos TEXT,
  nivel_urgencia VARCHAR(30),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prontuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agendamento_id UUID REFERENCES agendamentos(id) ON DELETE CASCADE,
  psicologo_id UUID REFERENCES psicologos(id) ON DELETE CASCADE,
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  anotacoes TEXT NOT NULL,
  conduta TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de mensagens do chat (nova)
CREATE TABLE IF NOT EXISTS mensagens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agendamento_id UUID REFERENCES agendamentos(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_psicologos_especialidade ON psicologos(especialidade);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data_hora);
CREATE INDEX IF NOT EXISTS idx_enderecos_cidade_estado ON enderecos(cidade, estado);
CREATE INDEX IF NOT EXISTS idx_mensagens_agendamento ON mensagens(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
