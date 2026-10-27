import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
import html

# Cores do Sistema de Design
COLOR_PRIMARY = colors.HexColor('#0F172A')   # Slate 900
COLOR_SECONDARY = colors.HexColor('#1E293B') # Slate 800
COLOR_MUTED = colors.HexColor('#64748B')     # Slate 500
COLOR_LIGHT_BG = colors.HexColor('#F8FAFC')  # Slate 50
COLOR_BORDER = colors.HexColor('#CBD5E1')    # Slate 300

# Paleta de Severidade
COLOR_CRITICA = colors.HexColor('#B91C1C')     # Red 700
COLOR_ALTA = colors.HexColor('#EA580C')        # Orange 600
COLOR_MEDIA = colors.HexColor('#D97706')       # Amber 600
COLOR_BAIXA = colors.HexColor('#2563EB')       # Blue 600
COLOR_PONTO_FORTE = colors.HexColor('#059669') # Emerald 600

class NumberedCanvas(canvas.Canvas):
    """Canvas com paginação 'Página X de Y' e cabeçalho elegante em todas as páginas exceto a capa."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_decorations(self, page_count):
        if self._pageNumber == 1:
            return  # Capa limpa

        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(COLOR_MUTED)

        # Cabeçalho
        self.drawString(2 * cm, 28.2 * cm, "PsicoConnect — Auditoria de Segurança & Guia Técnico de Resolução em Grupo")
        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.6)
        self.line(2 * cm, 28.0 * cm, 19 * cm, 28.0 * cm)

        # Rodapé
        self.line(2 * cm, 1.8 * cm, 19 * cm, 1.8 * cm)
        self.drawString(2 * cm, 1.3 * cm, "CONFIDENCIAL — Documento de Engenharia de Software & Segurança da Informação")
        page_str = f"Página {self._pageNumber} de {page_count}"
        self.drawRightString(19 * cm, 1.3 * cm, page_str)
        self.restoreState()

def build_complete_pdf(filename="relatorio-auditoria-e-resolucao-completo.pdf"):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_pdf = os.path.join(script_dir, filename)

    doc = SimpleDocTemplate(
        output_pdf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.2 * cm,
        bottomMargin=2.2 * cm
    )

    styles = getSampleStyleSheet()

    style_cover_badge = ParagraphStyle(
        'CoverBadge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=COLOR_CRITICA
    )
    style_cover_title = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=COLOR_PRIMARY,
        spaceAfter=10
    )
    style_cover_sub = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=COLOR_MUTED,
        spaceAfter=18
    )
    style_h1 = ParagraphStyle(
        'H1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13.5,
        leading=17,
        textColor=COLOR_PRIMARY,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )
    style_h2 = ParagraphStyle(
        'H2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=COLOR_SECONDARY,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )
    style_h3 = ParagraphStyle(
        'H3',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=COLOR_SECONDARY,
        spaceBefore=6,
        spaceAfter=2,
        keepWithNext=True
    )
    style_body = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.3,
        leading=12,
        textColor=colors.HexColor('#334155'),
        spaceAfter=5
    )
    style_body_bold = ParagraphStyle(
        'BodyBold',
        parent=style_body,
        fontName='Helvetica-Bold'
    )
    style_code = ParagraphStyle(
        'CodeBlock',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7.2,
        leading=9.8,
        textColor=COLOR_PRIMARY,
        backColor=colors.HexColor('#F1F5F9'),
        borderPadding=5,
        spaceAfter=6
    )
    style_table_cell = ParagraphStyle(
        'Cell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=COLOR_SECONDARY
    )
    style_table_header = ParagraphStyle(
        'HeaderCell',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )
    style_chip_text = ParagraphStyle(
        'ChipText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        alignment=1,
        textColor=colors.white
    )

    story = []

    # ==========================================
    # CAPA
    # ==========================================
    story.append(Spacer(1, 1.8 * cm))
    
    badge_content = [[Paragraph("<b>DOCUMENTO TÉCNICO DE ENGENHARIA DE SOFTWARE & SEGURANÇA</b>", style_cover_badge)]]
    t_badge = Table(badge_content, colWidths=[17 * cm])
    t_badge.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#FEE2E2')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#FCA5A5')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_badge)
    story.append(Spacer(1, 14))

    story.append(Paragraph("Relatório de Auditoria de Segurança & Guia de Resolução em Grupo", style_cover_title))
    story.append(Paragraph("Avaliação Técnica Exaustiva das 5 Falhas Críticas & Especificação Passo a Passo de Remediação para a Equipe", style_cover_sub))
    story.append(HRFlowable(width="100%", thickness=2, color=COLOR_PRIMARY, spaceBefore=0, spaceAfter=16))

    meta = [
        [Paragraph("<b>Projeto:</b>", style_body_bold), Paragraph("PsicoConnect — Plataforma Integrada de Atendimento Psicológico (v2.0.0 Monorepo)", style_body)],
        [Paragraph("<b>Data de Realização:</b>", style_body_bold), Paragraph("16 de Setembro de 2026", style_body)],
        [Paragraph("<b>Escopo Auditado:</b>", style_body_bold), Paragraph("backend/ (src/server.js, routes/, middleware/, config/), database/ (schema.sql, seed.sql), frontend/ (HTMLs, js/script.js), CI/CD (.github/workflows/ci.yml)", style_body)],
        [Paragraph("<b>Finalidade:</b>", style_body_bold), Paragraph("Comprovação de Atividade Prática de Segurança da Informação e Manual de Remediação em Grupo", style_body)],
        [Paragraph("<b>Classificação:</b>", style_body_bold), Paragraph("<font color='#B91C1C'><b>CONFIDENCIAL — RESTRIÇÃO DE ACESSO TÉCNICO</b></font>", style_body)],
    ]
    t_meta = Table(meta, colWidths=[3.8 * cm, 13.2 * cm])
    t_meta.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BACKGROUND', (0,0), (-1,-1), COLOR_LIGHT_BG),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_meta)

    story.append(Spacer(1, 14))
    story.append(Paragraph("<b>Visão Geral Metodológica & Stack Detectada:</b>", style_h2))
    meth_desc = (
        "A base de código do <b>PsicoConnect</b> foi inspecionada de forma sistemática e abrangente. "
        "Foi detectada a seguinte stack técnica:<br/>"
        "• <b>Linguagem & Runtime:</b> JavaScript / Node.js (ES Modules, Node 20+).<br/>"
        "• <b>Backend Framework:</b> Express 4.21.2 com middlewares de rate-limiting, helmet e cors.<br/>"
        "• <b>Banco de Dados & Driver:</b> PostgreSQL nativo via driver <code>pg</code> (Pool connection), raw SQL parametrizado sem ORM.<br/>"
        "• <b>Autenticação & Tokens:</b> JSON Web Tokens (via <code>jsonwebtoken</code>) e <code>bcryptjs</code> para hash de senhas.<br/>"
        "• <b>Frontend:</b> Arquitetura híbrida (Vanilla HTML5 + JS DOM + CSS3) com persistência em <code>localStorage</code> e chamadas parciais REST.<br/>"
        "• <b>CI/CD:</b> GitHub Actions com testes automatizados contra PostgreSQL em container de serviço.<br/><br/>"
        "<b>Mapeamento das 5 Categorias:</b><br/>"
        "1. <i>Banco sem Tranca:</i> PostgreSQL sem RLS em <code>schema.sql</code>, exigindo isolamento lógico por filtros <code>WHERE usuario_id = $x</code> no Express.<br/>"
        "2. <i>Permissão no Navegador:</i> Validações de papel executadas apenas na interface web (ex: <code>session()?.tipo === 'Administrador'</code>) sem restrição no backend.<br/>"
        "3. <i>IDOR:</i> Handlers que consomem <code>:id</code> de objetos (agendamentos, mensagens) sem conferir pertinência do usuário.<br/>"
        "4. <i>Chaves Expostas:</i> Segredos e chaves com fallbacks permissivos hardcoded em código e credenciais demo.<br/>"
        "5. <i>Inputs sem Tratamento (XSS):</i> Manipulação direta de <code>innerHTML</code> sem bibliotecas de sanitização (como DOMPurify)."
    )
    story.append(Paragraph(meth_desc, style_body))

    story.append(PageBreak())

    # ==========================================
    # SEÇÃO 1: ACHADOS EXAUSTIVOS ARQUIVO POR ARQUIVO
    # ==========================================
    story.append(Paragraph("1. Lista Exaustiva de Achados de Segurança (Arquivo por Arquivo, Linha por Linha)", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BORDER, spaceBefore=2, spaceAfter=8))

    # Tabela resumo com chips coloridos destacados
    findings_raw = [
        ("CRÍTICA", COLOR_CRITICA, "3. IDOR", "databaseRoutes.js:189-204", "Cancelamento de consultas de terceiros por qualquer usuário autenticado."),
        ("CRÍTICA", COLOR_CRITICA, "4. Chaves Expostas", "authMiddleware.js:4", "Segredo JWT com fallback padrão hardcoded sem fail-fast no boot."),
        ("ALTA", COLOR_ALTA, "1. Banco sem Tranca", "databaseRoutes.js:207-221", "GET /api/mensagens/:id sem verificar se o usuário é participante da consulta."),
        ("ALTA", COLOR_ALTA, "1. Banco sem Tranca", "databaseRoutes.js:224-241", "POST /api/mensagens permite injeção de mensagens em consultas alheias."),
        ("ALTA", COLOR_ALTA, "3. IDOR / Aberta", "server.js:136-168", "POST /api/meet/create-event público e sem autorização (spam e abuso de cota)."),
        ("ALTA", COLOR_ALTA, "5. XSS", "script.js:247", "Cross-Site Scripting armazenado no chat via concatenação direta em innerHTML."),
        ("MÉDIA", COLOR_MEDIA, "2. Permissão Navegador", "script.js:155, 209-215", "Painel admin restrito apenas por verificação de flag mock no localStorage."),
        ("MÉDIA", COLOR_MEDIA, "2. Permissão Navegador", "databaseRoutes.js:78-108", "POST /api/psicologos público permite injeção de perfil sem senha."),
        ("MÉDIA", COLOR_MEDIA, "4. Chaves / SSL", "db.js:7", "rejectUnauthorized: false desabilita validação de certificado SSL no PostgreSQL."),
        ("MÉDIA", COLOR_MEDIA, "5. XSS", "script.js:238", "DOM-based XSS na tela de triagem via innerHTML."),
        ("BAIXA", COLOR_BAIXA, "4. Chaves Expostas", "seed.sql:11-15", "Credenciais de demonstração (admin@psicoconnect.com / 123456) em seed."),
    ]

    findings_table_data = [
        [
            Paragraph("<b>Sev.</b>", style_table_header),
            Paragraph("<b>Categoria</b>", style_table_header),
            Paragraph("<b>Arquivo e Linha</b>", style_table_header),
            Paragraph("<b>Descrição Sintética do Risco</b>", style_table_header)
        ]
    ]

    table_styles = [
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
    ]

    for idx, (sev_text, sev_color, cat, file_line, desc) in enumerate(findings_raw, start=1):
        findings_table_data.append([
            Paragraph(f"<b>{sev_text}</b>", style_chip_text),
            Paragraph(cat, style_table_cell),
            Paragraph(f"<code>{file_line}</code>", style_table_cell),
            Paragraph(desc, style_table_cell)
        ])
        table_styles.append(('BACKGROUND', (0, idx), (0, idx), sev_color))
        table_styles.append(('ALIGN', (0, idx), (0, idx), 'CENTER'))

    t_find_sum = Table(findings_table_data, colWidths=[2.0 * cm, 3.2 * cm, 4.3 * cm, 7.5 * cm])
    t_find_sum.setStyle(TableStyle(table_styles))
    story.append(t_find_sum)

    story.append(Spacer(1, 10))
    story.append(Paragraph("Detalhamento dos Achados Críticos e Altos:", style_h2))

    findings_detail_p1 = [
        ("Achado 1: IDOR no Cancelamento de Agendamentos (CRÍTICA)", COLOR_CRITICA,
         "backend/src/routes/databaseRoutes.js:189-204",
         "router.patch('/agendamentos/:id/cancelar', requireAuth, async (req, res) => {\n  const { id } = req.params;\n  const result = await query(\n    `UPDATE agendamentos SET status = 'cancelado' WHERE id = $1 RETURNING *`,\n    [id]\n  );",
         "Qualquer paciente ou psicólogo autenticado na plataforma pode cancelar consultas de outros profissionais e pacientes arbitrariamente fornecendo o identificador UUID da consulta. Não há verificação de vínculo entre o usuário da sessão (req.user.id) e o paciente_id ou psicologo_id do agendamento."),

        ("Achado 2: Segredo JWT com Fallback Público Hardcoded (CRÍTICA)", COLOR_CRITICA,
         "backend/src/middleware/authMiddleware.js:4",
         "const JWT_SECRET = process.env.JWT_SECRET || 'psicoconnect_dev_secret_troque_em_producao';",
         "Se a variável JWT_SECRET for omitida no ambiente de deploy (Render, Docker, etc.), o sistema sobe em silêncio utilizando um segredo estático público. Qualquer atacante pode assinar tokens JWT forjados com { tipo: 'admin' } e obter acesso administrativo irrestrito à API."),
    ]

    for title, col, path, snippet, why in findings_detail_p1:
        escaped_snippet = html.escape(snippet).replace('\n', '<br/>')
        escaped_why = html.escape(why)
        item_story = [
            Paragraph(f"<font color='{col}'><b>• {html.escape(title)}</b></font>", style_h3),
            Paragraph(f"<b>Arquivo:</b> <code>{html.escape(path)}</code>", style_body),
            Paragraph(escaped_snippet, style_code),
            Paragraph(f"<b>Explorabilidade & Impacto:</b> {escaped_why}", style_body),
            Spacer(1, 3)
        ]
        story.append(KeepTogether(item_story))

    story.append(PageBreak())

    # Continuação dos achados altos
    findings_detail_p2 = [
        ("Achado 3: Vazamento de Mensagens Clínicas Confidenciais (ALTA)", COLOR_ALTA,
         "backend/src/routes/databaseRoutes.js:207-221",
         "router.get('/mensagens/:agendamentoId', requireAuth, async (req, res) => {\n  const result = await query(\n    `SELECT m.*, u.nome AS autor_nome FROM mensagens m ... WHERE m.agendamento_id = $1`,\n    [req.params.agendamentoId]\n  );",
         "Quebra grave de sigilo profissional médico-psicológico e violação da LGPD. O endpoint lista conversas privadas da consulta sem validar se o requisitante autenticado é o paciente ou o psicólogo responsável pela sessão."),

        ("Achado 4: Rota de Criação do Google Meet Desprotegida (ALTA)", COLOR_ALTA,
         "backend/src/server.js:136-168",
         "app.post('/api/meet/create-event', async (req, res) => {\n  const { consultaId, summary, description, startDateTime, endDateTime, pacienteEmail, psicologoEmail } = req.body;",
         "Endpoint totalmente público (sem requireAuth) que aceita consultaId e e-mails de destino arbitrários. Permite a atacantes esgotar cotas da API Google Calendar da clínica e enviar e-mails de phishing/spam legítimos a terceiros."),

        ("Achado 5: Stored Cross-Site Scripting (XSS) no Chat (ALTA)", COLOR_ALTA,
         "frontend/js/script.js:247",
         "byId('chatMensagens').innerHTML = banco.mensagens.map(m =>\n  `<div class=\"chat-bubble ${m.autorTipo===s.tipo?'mine':''}\"><b>${m.autorTipo}</b><p>${m.texto}</p></div>`\n).join('');",
         "As mensagens enviadas no chat são injetadas diretamente via innerHTML sem sanitização ou escape. Cargas maliciosas executam scripts no contexto do navegador do psicólogo, permitindo roubo de sessões e manipulação de prontuários.")
    ]

    for title, col, path, snippet, why in findings_detail_p2:
        escaped_snippet = html.escape(snippet).replace('\n', '<br/>')
        escaped_why = html.escape(why)
        item_story = [
            Paragraph(f"<font color='{col}'><b>• {html.escape(title)}</b></font>", style_h3),
            Paragraph(f"<b>Arquivo:</b> <code>{html.escape(path)}</code>", style_body),
            Paragraph(escaped_snippet, style_code),
            Paragraph(f"<b>Explorabilidade & Impacto:</b> {escaped_why}", style_body),
            Spacer(1, 3)
        ]
        story.append(KeepTogether(item_story))

    story.append(PageBreak())

    # ==========================================
    # SEÇÃO 2: PONTOS FORTES
    # ==========================================
    story.append(Paragraph("2. Pontos Fortes Identificados (Validados no Código Real)", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BORDER, spaceBefore=2, spaceAfter=8))

    strengths = [
        ("1. Prevenção Efetiva contra SQL Injection (SQLi)",
         "backend/src/routes/databaseRoutes.js e authRoutes.js",
         "Todas as operações de consulta e manipulação de dados utilizam exclusivamente queries parametrizadas com placeholders ($1, $2...) através do driver pg nativo. Não foi identificada nenhuma concatenação insegura de strings em comandos SQL."),
        ("2. Armazenamento Criptografado de Credenciais",
         "backend/src/routes/authRoutes.js:46, 121",
         "As senhas de usuários nunca são armazenadas em texto simples. O sistema aplica o algoritmo bcrypt (bcrypt.hash(senha, 10)) no cadastro e realiza a comparação segura de hashes (bcrypt.compare) no fluxo de login."),
        ("3. Política Estruturada de Limitação de Requisições (Rate Limiting)",
         "backend/src/server.js:36-50",
         "A API implementa express-rate-limit de forma em camadas: um limitador global (100 requisições / 15 min) e um limitador restritivo específico para as rotas de autenticação /api/auth (20 requisições / 15 min), mitigando ataques de força bruta e credential stuffing."),
        ("4. Isolamento Correto na Listagem Inicial de Agendamentos",
         "backend/src/routes/databaseRoutes.js:121-155",
         "O endpoint GET /api/agendamentos inspeciona o token autenticado e aplica cláusulas WHERE rigorosas (WHERE ps.usuario_id = $1 para psicólogos e WHERE pa.usuario_id = $1 para pacientes), garantindo que a listagem inicial não vaze consultas alheias."),
        ("5. Controle de Acesso Baseado em Papéis (RBAC) em Rotas Críticas",
         "backend/src/routes/databaseRoutes.js:37, 55",
         "As rotas de consulta geral e homologação de novos psicólogos (/api/psicologos/todos e /api/psicologos/:id/validacao) implementam o middleware encadeado requireAuth e requireRole('admin'), bloqueando tentativas de acesso de pacientes ou psicólogos comuns.")
    ]

    for title, path, desc in strengths:
        story.append(Paragraph(f"<font color='#059669'><b>✔ {html.escape(title)}</b></font>", style_h3))
        story.append(Paragraph(f"<b>Evidência:</b> <code>{html.escape(path)}</code>", style_body))
        story.append(Paragraph(html.escape(desc), style_body))
        story.append(Spacer(1, 4))

    story.append(PageBreak())

    # ==========================================
    # SEÇÃO 3: GUIA DE CORREÇÃO EM GRUPO
    # ==========================================
    story.append(Paragraph("3. Guia Técnico de Resolução em Grupo (Plano de Remediação)", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BORDER, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Para a execução colaborativa da remediação, foi estruturada uma matriz de divisão de tarefas "
        "distribuída entre 4 integrantes do grupo de desenvolvimento, acompanhada das correções de código completas:",
        style_body
    ))

    # Tabela de papéis do grupo - Mantida íntegra na página
    group_roles = [
        [Paragraph("<b>Membro / Papel</b>", style_table_header), Paragraph("<b>Módulo Responsável</b>", style_table_header), Paragraph("<b>Vulnerabilidades Atribuídas</b>", style_table_header), Paragraph("<b>Arquivos Alvo</b>", style_table_header)],
        [Paragraph("<b>Dev 1 (Backend Auth)</b>", style_table_cell), Paragraph("Autenticação e Startup", style_table_cell), Paragraph("• Segredo JWT hardcoded<br/>• Fail-fast no boot do servidor<br/>• Reativação da CSP no Helmet", style_table_cell), Paragraph("<code>authMiddleware.js</code><br/><code>server.js</code><br/><code>.env.example</code>", style_table_cell)],
        [Paragraph("<b>Dev 2 (Backend Logic)</b>", style_table_cell), Paragraph("Regras de Negócio e APIs", style_table_cell), Paragraph("• IDOR no cancelamento de consultas<br/>• Isolamento do chat (GET e POST)<br/>• Proteção da rota do Meet", style_table_cell), Paragraph("<code>databaseRoutes.js</code><br/><code>server.js</code>", style_table_cell)],
        [Paragraph("<b>Dev 3 (Frontend DOM)</b>", style_table_cell), Paragraph("Interface e Sanitização", style_table_cell), Paragraph("• Mitigação de XSS (Chat e Triagem)<br/>• Integração do Admin com a API real<br/>• Limpeza de credenciais demo", style_table_cell), Paragraph("<code>script.js</code><br/><code>admin.html</code><br/><code>login.html</code>", style_table_cell)],
        [Paragraph("<b>Dev 4 (Database & QA)</b>", style_table_cell), Paragraph("Banco de Dados e Testes", style_table_cell), Paragraph("• Saneamento do seed.sql<br/>• Correção do SSL rejectUnauthorized<br/>• Bateria de testes de regressão", style_table_cell), Paragraph("<code>schema.sql</code>, <code>seed.sql</code><br/><code>db.js</code><br/><code>database.test.js</code>", style_table_cell)],
    ]
    t_roles = Table(group_roles, colWidths=[3.2 * cm, 3.2 * cm, 6.0 * cm, 4.6 * cm])
    t_roles.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_SECONDARY),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
    ]))
    story.append(t_roles)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Passo a Passo das Correções Técnicas (Antes vs. Depois):", style_h2))

    fixes_part1 = [
        ("Correção 1 (Dev 1): Fail-fast e Eliminação de Fallback no Segredo JWT",
         "// backend/src/middleware/authMiddleware.js:4\n"
         "- const JWT_SECRET = process.env.JWT_SECRET || 'psicoconnect_dev_secret_troque_em_producao';\n"
         "+ const JWT_SECRET = process.env.JWT_SECRET;\n"
         "+ if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {\n"
         "+   console.error('FATAL: A variável JWT_SECRET não está definida!');\n"
         "+   process.exit(1);\n"
         "+ }\n\n"
         "// backend/src/server.js (logo após imports):\n"
         "+ if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {\n"
         "+   console.error('FATAL: JWT_SECRET fraca ou ausente em produção!');\n"
         "+   process.exit(1);\n"
         "+ }"),

        ("Correção 2 (Dev 2): Verificação de Propriedade contra IDOR no Cancelamento",
         "// backend/src/routes/databaseRoutes.js:189-204\n"
         "router.patch('/agendamentos/:id/cancelar', requireAuth, async (req, res) => {\n"
         "  const { id } = req.params;\n"
         "+ const userId = req.user.id;\n"
         "+ const userRole = req.user.tipo;\n"
         "  try {\n"
         "+   let result;\n"
         "+   if (userRole === 'admin') {\n"
         "+     result = await query('UPDATE agendamentos SET status = \\'cancelado\\' WHERE id = $1 RETURNING *', [id]);\n"
         "+   } else {\n"
         "+     result = await query(`\n"
         "+       UPDATE agendamentos SET status = 'cancelado' WHERE id = $1 AND (\n"
         "+         paciente_id IN (SELECT id FROM pacientes WHERE usuario_id = $2)\n"
         "+         OR psicologo_id IN (SELECT id FROM psicologos WHERE usuario_id = $2)\n"
         "+       ) RETURNING *`, [id, userId]);\n"
         "+   }\n"
         "    if (result.rows.length === 0) {\n"
         "-     return res.status(404).json({ ok: false, error: 'Agendamento não encontrado.' });\n"
         "+     return res.status(403).json({ ok: false, error: 'Acesso negado ou consulta inexistente.' });\n"
         "    }\n"
         "    res.json({ ok: true, agendamento: result.rows[0], mensagem: 'Consulta cancelada.' });"),
    ]

    for title, code_block in fixes_part1:
        item = [
            Paragraph(f"<b>{html.escape(title)}</b>", style_h3),
            Paragraph(html.escape(code_block).replace('\n', '<br/>'), style_code),
            Spacer(1, 2)
        ]
        story.append(KeepTogether(item))

    story.append(PageBreak())

    # Continuação das correções de código
    fixes_part2 = [
        ("Correção 3 (Dev 2): Isolamento de Participantes nas Mensagens do Chat",
         "// backend/src/routes/databaseRoutes.js:207-241\n"
         "+ async function usuarioParticipaDoAgendamento(agendamentoId, user) {\n"
         "+   if (user.tipo === 'admin') return true;\n"
         "+   const check = await query(`\n"
         "+     SELECT a.id FROM agendamentos a\n"
         "+     LEFT JOIN pacientes pa ON pa.id = a.paciente_id\n"
         "+     LEFT JOIN psicologos ps ON ps.id = a.psicologo_id\n"
         "+     WHERE a.id = $1 AND (pa.usuario_id = $2 OR ps.usuario_id = $2)`,\n"
         "+     [agendamentoId, user.id]);\n"
         "+   return check.rows.length > 0;\n"
         "+ }\n\n"
         "// Aplicar nas rotas GET /mensagens/:agendamentoId e POST /mensagens:\n"
         "+ const temAcesso = await usuarioParticipaDoAgendamento(agendamentoId, req.user);\n"
         "+ if (!temAcesso) return res.status(403).json({ ok: false, error: 'Acesso negado ao chat desta consulta.' });"),

        ("Correção 4 (Dev 2): Proteção e Anti-Spoofing na Rota do Google Meet",
         "// backend/src/server.js:136-168\n"
         "- app.post('/api/meet/create-event', async (req, res) => {\n"
         "+ app.post('/api/meet/create-event', requireAuth, async (req, res) => {\n"
         "  const { consultaId, summary, description, startDateTime, endDateTime } = req.body;\n"
         "+ // Buscar participantes reais direto do banco de dados (impede spoofing de e-mails)\n"
         "+ const ag = await query(`\n"
         "+   SELECT a.id, up.email AS pac_email, ups.email AS psi_email FROM agendamentos a\n"
         "+   JOIN pacientes pa ON pa.id = a.paciente_id JOIN usuarios up ON up.id = pa.usuario_id\n"
         "+   JOIN psicologos ps ON ps.id = a.psicologo_id JOIN usuarios ups ON ups.id = ps.usuario_id\n"
         "+   WHERE a.id = $1 AND (up.id = $2 OR ups.id = $2 OR $3 = 'admin')`,\n"
         "+   [consultaId, req.user.id, req.user.tipo]);\n"
         "+ if (ag.rows.length === 0) return res.status(403).json({ ok: false, error: 'Consulta não autorizada.' });\n"
         "+ const pacienteEmail = ag.rows[0].pac_email;\n"
         "+ const psicologoEmail = ag.rows[0].psi_email;"),

        ("Correção 5 (Dev 3): Substituição de innerHTML por Manipulação Segura de DOM (Anti-XSS)",
         "// frontend/js/script.js:247 (Renderização do chat):\n"
         "function draw() {\n"
         "  const container = byId('chatMensagens');\n"
         "  container.innerHTML = '';\n"
         "  const mensagens = db().mensagens.filter(m => m.consultaId === id);\n"
         "  mensagens.forEach(m => {\n"
         "    const bubble = document.createElement('div');\n"
         "    bubble.className = `chat-bubble ${m.autorTipo === s.tipo ? 'mine' : ''}`;\n"
         "    const b = document.createElement('b'); b.textContent = m.autorTipo;\n"
         "    const p = document.createElement('p');\n"
         "    p.textContent = m.texto; // SEGURO: textContent não executa HTML/scripts!\n"
         "    bubble.appendChild(b); bubble.appendChild(p);\n"
         "    container.appendChild(bubble);\n"
         "  });\n"
         "}"),
    ]

    for title, code_block in fixes_part2:
        item = [
            Paragraph(f"<b>{html.escape(title)}</b>", style_h3),
            Paragraph(html.escape(code_block).replace('\n', '<br/>'), style_code),
            Spacer(1, 2)
        ]
        story.append(KeepTogether(item))

    story.append(PageBreak())

    # Correção 6 (Testes) + Seção 4 (Checklist e Conclusão)
    story.append(Paragraph("<b>Correção 6 (Dev 4): Testes Automatizados de Regressão de Segurança</b>", style_h3))
    test_code = (
        "// backend/src/__tests__/database.test.js:\n"
        "it('PATCH /api/agendamentos/:id/cancelar deve rejeitar IDOR com 403', async () => {\n"
        "  const res = await PATCH('/api/agendamentos/consulta-alheia-id/cancelar', { token: tokenInvasor });\n"
        "  assert.equal(res.status, 403);\n"
        "});\n\n"
        "it('GET /api/mensagens/:id deve rejeitar leitura não autorizada com 403', async () => {\n"
        "  const res = await GET('/api/mensagens/consulta-alheia-id', { token: tokenInvasor });\n"
        "  assert.equal(res.status, 403);\n"
        "});\n\n"
        "it('POST /api/meet/create-event deve exigir autenticação (401)', async () => {\n"
        "  const res = await POST('/api/meet/create-event', { body: { consultaId: '123' } });\n"
        "  assert.equal(res.status, 401);\n"
        "});"
    )
    story.append(Paragraph(html.escape(test_code).replace('\n', '<br/>'), style_code))
    story.append(Spacer(1, 8))

    # ==========================================
    # SEÇÃO 4: CHECKLIST E CONCLUSÃO
    # ==========================================
    story.append(Paragraph("4. Checklist de Validação para Code Review da Equipe", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BORDER, spaceBefore=2, spaceAfter=8))

    checklist_items = [
        "[ ] <b>JWT_SECRET:</b> Removido qualquer fallback estático; validação de tamanho mínimo (&gt;=32 chars) ativa no boot.",
        "[ ] <b>Variáveis de Ambiente:</b> Arquivo <code>.env</code> devidamente ignorado no <code>.gitignore</code> e sem chaves privadas commitadas.",
        "[ ] <b>Controle de Propriedade (Anti-IDOR):</b> Cancelamento de agendamento restrito ao paciente, psicólogo ou administrador.",
        "[ ] <b>Isolamento de Chat:</b> Validação obrigatória impedindo que usuários leiam ou postem em chats de consultas alheias.",
        "[ ] <b>Google Meet:</b> Protegido por <code>requireAuth</code> com busca dos e-mails dos participantes direto do banco de dados.",
        "[ ] <b>Proteção XSS:</b> Uso estrito de <code>textContent</code> / <code>createElement</code> no frontend para textos manipuláveis por usuários.",
        "[ ] <b>Content Security Policy (CSP):</b> Reativada no middleware <code>helmet</code> com fontes estritas.",
        "[ ] <b>Testes Automatizados:</b> Suíte de testes de regressão (<code>npm test</code>) executando com 100% de sucesso no backend.",
        "[ ] <b>CI/CD:</b> Pipeline do GitHub Actions aprovado com todas as validações de segurança ativas."
    ]

    for chk in checklist_items:
        story.append(Paragraph(chk, style_body))

    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "<b>Conclusão:</b> Com a aplicação do plano de remediação deste guia, o sistema <b>PsicoConnect</b> "
        "atinge total conformidade com as diretrizes de desenvolvimento seguro (OWASP Top 10), garantindo o sigilo "
        "clínico exigido pelo Conselho Federal de Psicologia (CFP) e a conformidade legal com a Lei Geral de Proteção de Dados (LGPD).",
        style_body
    ))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF completo refinado gerado com sucesso em: {output_pdf}")
    return output_pdf

if __name__ == "__main__":
    build_complete_pdf()
