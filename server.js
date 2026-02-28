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

        const prompt = `Você é Lucas Janone, um renomado especialista em viagens de luxo acessível. Crie um roteiro premium incrivelmente persuasivo.
        Cliente: ${nome} | Destino: ${destino} | Data: ${dataViagem} | Viajantes: ${numeroViajantes} | Orçamento: R$ ${orcamento} (EM REAIS) | Exigências: ${mustHaves}
        
        REGRAS OBRIGATÓRIAS DE FORMATAÇÃO:
        - Responda APENAS com código HTML (sem as tags html, head ou body).
        - Use <h2> para separar os dias e <h3> para os turnos (Manhã, Tarde, Noite). Use emojis nos títulos.
        - LINKS CLICÁVEIS (OBRIGATÓRIO): Sempre que mencionar um hotel, restaurante ou atração turística, você DEVE colocar um link real (tag <a>) apontando para o site oficial, TripAdvisor ou Google Maps. Exemplo: <a href="https://www.tripadvisor.com/Search?q=NomeDoLocal" target="_blank">Nome do Local</a>
        - CITAÇÃO: Logo após a introdução, adicione uma citação histórica ou frase inspiradora sobre ${destino}. Use: <blockquote class="quote">"Frase" <br><strong>- Autor</strong></blockquote>
        - DICA DO LUCAS: Coloque as dicas dentro de: <div class="dica-lucas"><strong>💡 Dica do Lucas:</strong> ...</div>
        
        ESTRUTURA DO CONTEÚDO:
        1. Boas-vindas calorosas ao ${nome}.
        2. A Citação inspiradora.
        3. Estratégia Financeira (EM REAIS): Estimativa de gasto diário médio provando luxo acessível.
        4. Roteiro Dia a Dia (com links obrigatórios em todos os locais!). Insira a frase: "Como eu sempre ensino aos meus alunos da Mentoria, o segredo de viajar bem é..."
        5. 3 Curiosidades locais exclusivas.
        6. A Dica de Ouro do Lucas.
        7. Convite elegante para a Mentoria de Viagens.`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent(prompt);
        let roteiroHTML = result.response.text();
        roteiroHTML = roteiroHTML.replace(/```html|```/g, '');

        // INJEÇÃO AUTOMÁTICA DE IMAGENS
        let imageCounter = 1;
        const destinoFormatado = encodeURIComponent(destino.trim());
        
        roteiroHTML = roteiroHTML.replace(/<h2(.*?)>(.*?)<\/h2>/g, (match) => {
            const imgUrl = `https://image.pollinations.ai/prompt/beautiful%20scenery%20landmark%20tourist%20spot%20in%20${destinoFormatado}%20day%20${imageCounter}%20travel%20photography%204k?width=800&height=400&nologo=true`;
            imageCounter++;
            return `${match}\n<div class="img-container"><img class="day-image" src="${imgUrl}" alt="Visual incrível de ${destino}"></div>`;
        });

        const coverImageUrl = `https://image.pollinations.ai/prompt/beautiful%20landmark%20scenery%20${destinoFormatado}%20travel%20photography%204k?width=1200&height=1600&nologo=true`;

        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
                
                @page { margin: 0; }
                
                body { 
                    font-family: 'Inter', sans-serif; color: #1e293b; background-color: #fcfcfc; 
                    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239ba9b4' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
                    margin: 0; padding: 0; line-height: 1.6; 
                }
                
                /* Forçando a impressora a imprimir o fundo escuro e a foto da capa */
                .cover { 
                    height: 100vh; width: 100vw;
                    background-color: #0f172a; 
                    background-image: linear-gradient(rgba(15, 23, 42, 0.65), rgba(15, 23, 42, 0.95)), url('${coverImageUrl}');
                    background-size: cover; background-position: center;
                    color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; 
                    text-align: center; page-break-after: always; padding: 50px; box-sizing: border-box; 
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                .cover-subtitle { color: #FF6B35; font-size: 20px; font-weight: 600; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
                .cover-title { font-size: 52px; font-weight: 800; margin: 0 0 30px 0; line-height: 1.1; text-shadow: 2px 2px 10px rgba(0,0,0,0.5); }
                .cover-client { font-size: 22px; font-weight: 300; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 30px; }
                .cover-client strong { color: #FF6B35; font-weight: 600; font-size: 30px; display: block; margin-top: 10px; }
                .cover-logo { margin-top: auto; font-size: 14px; color: #e2e8f0; letter-spacing: 2px; text-transform: uppercase; }

                .content-wrapper { padding: 40px 65px; } 
                
                h2 { 
                    color: #0f172a; font-size: 28px; border-bottom: 3px solid #FF6B35; 
                    padding-bottom: 12px; margin-bottom: 20px; margin-top: 0;
                    page-break-before: always; 
                    padding-top: 50px; 
                }
                .content-wrapper h2:first-of-type { page-break-before: avoid; padding-top: 10px; }
                
                h3 { color: #FF6B35; font-size: 20px; margin-top: 35px; margin-bottom: 15px; }
                p, li { font-size: 15px; color: #334155; }
                
                /* Estilo dos Links para ficarem laranjas e bonitos */
                a { color: #FF6B35; text-decoration: none; font-weight: 600; border-bottom: 1px solid transparent; transition: 0.3s; }
                a:hover { border-bottom: 1px solid #FF6B35; }
                
                .img-container { width: 100%; text-align: center; margin: 25px 0; page-break-inside: avoid; }
                .day-image { width: 100%; max-height: 350px; object-fit: cover; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.15); border: 4px solid white; }
                
                .quote { font-style: italic; color: #475569; border-left: 5px solid #FF6B35; padding-left: 20px; margin: 40px 0; font-size: 18px; line-height: 1.6; background-color: rgba(255,107,53,0.05); padding: 20px; border-radius: 0 12px 12px 0; }
                .quote strong { color: #0f172a; display: block; margin-top: 10px; font-size: 14px; text-transform: uppercase; font-style: normal; }
                .dica-lucas { background-color: #ffffff; border-left: 5px solid #0f172a; padding: 25px; margin: 30px 0; border-radius: 0 12px 12px 0; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); page-break-inside: avoid; }
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

        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        // Máscara para garantir que os sites de imagem não bloqueiem nosso robô
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        
        await page.setContent(htmlTemplate, { waitUntil: 'networkidle0', timeout: 60000 });
        
        // FREIO DE MÃO: O código só avança quando todas as fotos terminarem de baixar na página
        await page.evaluate(async () => {
            const images = Array.from(document.querySelectorAll('img'));
            await Promise.all(images.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise((resolve) => {
                    img.addEventListener('load', resolve);
                    img.addEventListener('error', resolve);
                });
            }));
        });

        // 2 segundinhos extras de segurança para o fundo preto da capa ser pintado
        await new Promise(r => setTimeout(r, 2000));
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ 
            path: filePath, 
            format: 'A4', 
            printBackground: true 
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