require('dotenv').config();
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

const pdfsDir = path.join(__dirname, 'public', 'pdfs');
if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
}
app.use('/pdfs', express.static(pdfsDir));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/gerar-roteiro', async (req, res) => {
    try {
        const { nome, dataViagem, numeroViajantes, destino, orcamento, mustHaves } = req.body;
        
        console.log(`[LOG] Recebido pedido de roteiro para: ${nome} - Destino: ${destino}`);

        // O RADAR: Buscando dinamicamente qual IA está liberada
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const apiResp = await fetch(url);
        const apiData = await apiResp.json();
        
        let targetModel = "gemini-1.5-flash"; 
        if (apiData.models) {
            const availableModels = apiData.models.filter(m => 
                m.name.includes('gemini') && 
                m.supportedGenerationMethods?.includes('generateContent')
            );
            if (availableModels.length > 0) {
                const flashModel = availableModels.find(m => m.name.includes('flash'));
                targetModel = flashModel ? flashModel.name.replace('models/', '') : availableModels[0].name.replace('models/', '');
            }
        }
        console.log(`[LOG] O radar detectou e selecionou o modelo: ${targetModel}`);

        // O NOVO PROMPT (Cérebro do Roteiro Premium)
        const prompt = `Você é Lucas Janone, um renomado especialista em viagens de luxo acessível. Crie um roteiro premium incrivelmente persuasivo.
        Cliente: ${nome} | Destino: ${destino} | Data: ${dataViagem} | Viajantes: ${numeroViajantes} | Orçamento: R$ ${orcamento} (ATENÇÃO: VALOR EM REAIS) | Exigências: ${mustHaves}
        
        REGRAS DE FORMATAÇÃO E DESIGN (OBRIGATÓRIO):
        - Responda APENAS com código HTML (sem as tags <html>, <head> ou <body>, apenas o conteúdo).
        - Use <h2> para separar os dias (ex: <h2>🗓️ Dia 1: A Chegada em [Destino]</h2>).
        - Use <h3> para os turnos (ex: <h3>🌅 Manhã</h3>, <h3>☀️ Tarde</h3>, <h3>🌙 Noite</h3>).
        - OBRIGATÓRIO: Use emojis em todos os títulos (<h2> e <h3>) para deixar a leitura dinâmica.
        - Use <p> para textos e <ul>/<li> para listas. Coloque termos chave em <strong>negrito</strong>.
        - Quando for dar uma dica especial, coloque dentro de uma div com a classe "dica-lucas": <div class="dica-lucas"><strong>💡 Dica do Lucas:</strong> ...</div>
        
        ESTRUTURA DO CONTEÚDO:
        1. Boas-vindas calorosas: Agradeça o ${nome} por confiar em você.
        2. Estratégia Financeira (EM REAIS): Explique como o orçamento de R$ ${orcamento} será usado com inteligência. Crie uma estimativa realista de "Gasto Diário Médio em Reais (R$)" por pessoa. Mostre que é possível ter luxo pagando menos.
        3. Roteiro Dia a Dia: Detalhado. Insira naturalmente no meio do roteiro a frase: "Como eu sempre ensino aos meus alunos da Mentoria, o segredo de viajar bem é..."
        4. 3 Curiosidades locais exclusivas.
        5. A Dica de Ouro do Lucas (para evitar perrengues).
        6. O Próximo Passo: Termine com um convite elegante e persuasivo para a "Mentoria de Viagens", dizendo que lá você ajuda a tirar esse roteiro do papel com suporte VIP.`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent(prompt);
        let roteiroHTML = result.response.text();

        roteiroHTML = roteiroHTML.replace(/```html|```/g, '');

        // O NOVO DESIGN (A Cara do Roteiro Premium)
        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
                
                body { font-family: 'Inter', sans-serif; color: #1e293b; background-color: #ffffff; margin: 0; padding: 0; line-height: 1.6; }
                
                /* CAPA DE REVISTA */
                .cover { 
                    height: 100vh; 
                    background-color: #0f172a; /* Azul escuro quase preto, igual sua LP */
                    color: white; 
                    display: flex; 
                    flex-direction: column; 
                    justify-content: center; 
                    align-items: center; 
                    text-align: center; 
                    page-break-after: always; /* Garante que a capa fique sozinha */
                    padding: 50px; 
                    box-sizing: border-box; 
                }
                .cover-subtitle { color: #FF6B35; font-size: 20px; font-weight: 600; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
                .cover-title { font-size: 48px; font-weight: 800; margin: 0 0 30px 0; line-height: 1.2; }
                .cover-client { font-size: 22px; font-weight: 300; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 30px; }
                .cover-client strong { color: #FF6B35; font-weight: 600; font-size: 28px; display: block; margin-top: 10px; }
                .cover-logo { margin-top: auto; font-size: 14px; color: #64748b; letter-spacing: 2px; text-transform: uppercase; }

                /* CONTEÚDO DO ROTEIRO */
                .content-wrapper { padding: 50px 60px; }
                
                /* QUEBRA DE PÁGINA INTELIGENTE (Cada dia em uma folha nova) */
                h2 { 
                    color: #0f172a; 
                    font-size: 26px; 
                    border-bottom: 3px solid #FF6B35; 
                    padding-bottom: 12px; 
                    margin-top: 0; 
                    page-break-before: always; 
                }
                /* Exceção: O primeiro H2 não quebra a página pois já vem depois da capa */
                .content-wrapper h2:first-of-type { page-break-before: avoid; }
                
                h3 { color: #FF6B35; font-size: 20px; margin-top: 30px; margin-bottom: 10px; }
                p, li { font-size: 15px; color: #334155; }
                ul { padding-left: 20px; margin-bottom: 20px; }
                strong { color: #0f172a; }
                
                /* CAIXA DE DICAS EXCLUSIVAS */
                .dica-lucas { 
                    background-color: #f8fafc; 
                    border-left: 5px solid #FF6B35; 
                    padding: 20px; 
                    margin: 30px 0; 
                    border-radius: 0 12px 12px 0; 
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                }
                .dica-lucas strong { color: #FF6B35; display: block; margin-bottom: 8px; font-size: 16px; }
            </style>
        </head>
        <body>
            <div class="cover">
                <div class="cover-subtitle">Plano de Viagem Exclusivo</div>
                <h1 class="cover-title">Sua Jornada Inesquecível<br>para ${destino}</h1>
                <div class="cover-client">Preparado sob medida para<br><strong>${nome}</strong></div>
                <div class="cover-logo">Lucas Janone • Mentoria de Viagens</div>
            </div>
            
            <div class="content-wrapper">
                ${roteiroHTML}
            </div>
        </body>
        </html>`;

        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ 
            path: filePath, 
            format: 'A4', 
            printBackground: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' } // Remove margens brancas para a capa preencher tudo
        });
        await browser.close();

        const pdfUrl = `https://${req.get('host')}/pdfs/${fileName}`;
        console.log(`[LOG] PDF gerado com sucesso: ${pdfUrl}`);
        
        res.json({ pdfUrl });

    } catch (error) {
        console.error('[ERRO] Falha:', error);
        res.status(500).json({ error: 'Falha ao gerar o roteiro' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô do Lucas Janone rodando na porta ${PORT}`);
});