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
        console.log(`[LOG] Modelo selecionado: ${targetModel}`);

        const prompt = `Você é Lucas Janone, um renomado especialista em viagens de luxo acessível. Crie um roteiro premium incrivelmente persuasivo.
        Cliente: ${nome} | Destino: ${destino} | Data: ${dataViagem} | Viajantes: ${numeroViajantes} | Orçamento: R$ ${orcamento} (EM REAIS) | Exigências: ${mustHaves}
        
        REGRAS DE FORMATAÇÃO E DESIGN (OBRIGATÓRIO):
        - Responda APENAS com código HTML (sem as tags html, head ou body).
        - Use <h2> para separar os dias e <h3> para os turnos (Manhã, Tarde, Noite). Use emojis nos títulos.
        - CITAÇÃO: Logo após a introdução, adicione uma citação histórica, provérbio ou frase inspiradora sobre o destino (${destino}). Use: <blockquote class="quote">"Frase" <br><strong>- Autor</strong></blockquote>
        - FOTOS POR DIA (OBRIGATÓRIO): Imediatamente abaixo de CADA <h2> de dia, insira uma imagem ilustrativa do local principal daquele dia usando esta tag exata (substitua os colchetes pelo nome do local em inglês com %20 no lugar dos espaços):
          <img class="day-image" src="https://image.pollinations.ai/prompt/[NOME%20DO%20LOCAL%20PRINCIPAL]%20[DESTINO]%20landmark%20beautiful%20photography%20high%20quality?width=800&height=400&nologo=true" alt="[Nome do local]">
        - DICA DO LUCAS: Coloque dicas dentro de: <div class="dica-lucas"><strong>💡 Dica do Lucas:</strong> ...</div>
        
        ESTRUTURA DO CONTEÚDO:
        1. Boas-vindas calorosas ao ${nome}.
        2. A Citação inspiradora.
        3. Estratégia Financeira (EM REAIS): Estimativa de gasto diário médio provando que é possível ter luxo pagando menos.
        4. Roteiro Dia a Dia (com a imagem do dia abaixo de cada título). Insira a frase: "Como eu sempre ensino aos meus alunos da Mentoria, o segredo de viajar bem é..."
        5. 3 Curiosidades locais exclusivas.
        6. A Dica de Ouro do Lucas.
        7. Convite elegante para a Mentoria de Viagens.`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent(prompt);
        let roteiroHTML = result.response.text();
        roteiroHTML = roteiroHTML.replace(/```html|```/g, '');

        // A MÁGICA DO DESIGN (Textura, Capa Dinâmica e Espaçamentos)
        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
                
                /* TEXTURA DE FUNDO E FONTES */
                body { 
                    font-family: 'Inter', sans-serif; 
                    color: #1e293b; 
                    background-color: #fdfdfc; 
                    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239ba9b4' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
                    margin: 0; padding: 0; line-height: 1.6; 
                }
                
                /* CAPA COM FOTO DINÂMICA DO DESTINO */
                .cover { 
                    height: 100vh; 
                    background-color: #0f172a; 
                    background-image: linear-gradient(rgba(15, 23, 42, 0.65), rgba(15, 23, 42, 0.95)), url('https://image.pollinations.ai/prompt/beautiful%20landmark%20scenery%20${encodeURIComponent(destino)}%20travel%20photography%204k?width=1200&height=1600&nologo=true');
                    background-size: cover; 
                    background-position: center;
                    color: white; 
                    display: flex; flex-direction: column; justify-content: center; align-items: center; 
                    text-align: center; page-break-after: always; padding: 50px; box-sizing: border-box; 
                }
                .cover-subtitle { color: #FF6B35; font-size: 20px; font-weight: 600; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
                .cover-title { font-size: 52px; font-weight: 800; margin: 0 0 30px 0; line-height: 1.1; text-shadow: 2px 2px 10px rgba(0,0,0,0.5); }
                .cover-client { font-size: 22px; font-weight: 300; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 30px; }
                .cover-client strong { color: #FF6B35; font-weight: 600; font-size: 30px; display: block; margin-top: 10px; }
                .cover-logo { margin-top: auto; font-size: 14px; color: #e2e8f0; letter-spacing: 2px; text-transform: uppercase; }

                /* RESPIRO DAS PÁGINAS */
                .content-wrapper { padding: 50px 70px; }
                
                /* TÍTULOS E ESPAÇAMENTOS CORRIGIDOS */
                h2 { 
                    color: #0f172a; font-size: 28px; border-bottom: 3px solid #FF6B35; 
                    padding-bottom: 12px; margin-top: 50px; padding-top: 40px; 
                    page-break-before: always; 
                }
                .content-wrapper h2:first-of-type { page-break-before: avoid; margin-top: 0; padding-top: 0; }
                h3 { color: #FF6B35; font-size: 20px; margin-top: 35px; margin-bottom: 15px; }
                p, li { font-size: 15px; color: #334155; }
                
                /* FOTOS DOS DIAS */
                .day-image { width: 100%; height: 300px; object-fit: cover; border-radius: 12px; margin: 25px 0; box-shadow: 0 8px 20px rgba(0,0,0,0.15); border: 4px solid white; }
                
                /* CITAÇÃO HISTÓRICA */
                .quote { font-style: italic; color: #475569; border-left: 5px solid #FF6B35; padding-left: 20px; margin: 40px 0; font-size: 20px; line-height: 1.6; background-color: rgba(255,107,53,0.05); padding: 20px; border-radius: 0 12px 12px 0; }
                .quote strong { color: #0f172a; display: block; margin-top: 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; font-style: normal; }

                /* DICAS */
                .dica-lucas { background-color: #ffffff; border-left: 5px solid #0f172a; padding: 25px; margin: 30px 0; border-radius: 0 12px 12px 0; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); }
                .dica-lucas strong { color: #0f172a; display: block; margin-bottom: 10px; font-size: 17px; }
            </style>
        </head>
        <body>
            <div class="cover">
                <div class="cover-subtitle">Plano de Viagem Exclusivo</div>
                <h1 class="cover-title">A Magia de<br>${destino}</h1>
                <div class="cover-client">Preparado sob medida para<br><strong>${nome}</strong></div>
                <div class="cover-logo">Lucas Janone • Mentoria de Viagens</div>
            </div>
            
            <div class="content-wrapper">
                ${roteiroHTML}
            </div>
        </body>
        </html>`;

        // Aumentei o timeout porque agora o robô vai baixar várias imagens antes de imprimir
        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(htmlTemplate, { waitUntil: 'networkidle2', timeout: 60000 });
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ 
            path: filePath, 
            format: 'A4', 
            printBackground: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
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
    console.log(`✅ Robô do Lucas Janone rodando na porta ${PORT}`);});