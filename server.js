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

// FUNÇÃO DE ESPERA: Essencial para não sermos bloqueados por baixar rápido demais
const delay = ms => new Promise(res => setTimeout(res, ms));

// MOTOR BASE64 BLINDADO: Baixa a imagem com segurança
async function getBase64Image(prompt, width, height) {
    try {
        const seed = Math.floor(Math.random() * 999999);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
        
        const response = await fetch(url, { timeout: 20000 });
        if (!response.ok) throw new Error('Servidor de imagem rejeitou o pedido');
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.error("[ERRO] Falha ao baixar imagem, inserindo fundo branco de segurança:", error.message);
        // Se a foto falhar, insere um pixel em branco para não quebrar o design com o ícone de "imagem quebrada"
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; 
    }
}

app.post('/api/gerar-roteiro', async (req, res) => {
    try {
        const { nome, dataViagem, numeroViajantes, destino, orcamento, mustHaves } = req.body;
        
        console.log(`[LOG] Iniciando roteiro blindado para: ${nome} - Destino: ${destino}`);

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

        // Prompt reescrito para evitar que a IA se confunda com maiúsculas/minúsculas
        const prompt = `Você é Lucas Janone, um renomado especialista em viagens de luxo acessível. Crie um roteiro premium.
        Cliente: ${nome} | Destino: ${destino} | Data: ${dataViagem} | Viajantes: ${numeroViajantes} | Orçamento: R$ ${orcamento} (EM REAIS) | Exigências: ${mustHaves}
        
        REGRAS ESTRITAS DE CÓDIGO:
        - Responda APENAS com código HTML (sem tags html ou body).
        - Use <h2> para os dias (Ex: <h2>Dia 1: Chegada em ${destino}</h2>).
        - Use <h3> para os turnos (Ex: <h3>Manhã: Atividade</h3>, <h3>Tarde: Atividade</h3>).
        - CITAÇÃO: Use <blockquote class="quote">"Frase" <br><strong>- Autor</strong></blockquote>
        
        ESTRUTURA DO CONTEÚDO:
        1. Boas-vindas a ${nome}.
        2. Citação inspiradora.
        3. Estratégia Financeira (EM REAIS).
        4. Roteiro Dia a Dia (insira a frase: "Como eu sempre ensino aos meus alunos da Mentoria, o segredo de viajar bem é...").
        5. 3 Curiosidades locais exclusivas.
        6. A Dica de Ouro do Lucas.
        7. Convite para a Mentoria de Viagens.`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent(prompt);
        let roteiroHTML = result.response.text();
        roteiroHTML = roteiroHTML.replace(/```html|```/g, '');

        // ------------------------------------------------------------------
        // SISTEMA DE FILA INDIANA: Baixa fotos uma a uma com pausa (Garante 100% de sucesso)
        // ------------------------------------------------------------------
        console.log(`[LOG] Baixando imagens sequencialmente para evitar bloqueios...`);
        const temas = ["beautiful landscape", "famous landmark", "cinematic architecture", "scenic view", "tourist attraction"];
        const destinoFormatado = encodeURIComponent(destino.trim());
        const partes = roteiroHTML.split(/(<h2.*?>.*?<\/h2>)/g);
        
        let novoHTML = "";
        let imageCounter = 0;
        
        for (let parte of partes) {
            if (parte.startsWith('<h2')) {
                const temaAtual = temas[imageCounter % temas.length];
                const promptFoto = `cinematic travel photography ${temaAtual} in ${destinoFormatado} 4k`;
                
                console.log(`[LOG] Processando imagem do dia ${imageCounter + 1}...`);
                const base64Img = await getBase64Image(promptFoto, 800, 400);
                
                novoHTML += `\n<div class="day-header">\n${parte}\n<div class="img-container"><img class="day-image" src="${base64Img}" alt="Visual de ${destino}"></div>\n</div>\n`;
                
                imageCounter++;
                await delay(1500); // PAUSA DE 1.5 SEGUNDOS (O segredo anti-bloqueio)
            } else {
                novoHTML += parte;
            }
        }
        roteiroHTML = novoHTML;

        // Baixando a Capa
        console.log(`[LOG] Processando a imagem da Capa...`);
        const coverBase64 = await getBase64Image(`beautiful cinematic luxury travel photography ${destinoFormatado} famous landmark`, 900, 1200);
        console.log(`[LOG] Todas as imagens foram injetadas no código!`);

        // ------------------------------------------------------------------
        // CSS AUTORITÁRIO: Força a formatação elegante ignorando os erros da IA
        // ------------------------------------------------------------------
        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet">
            
            <style>
                @page { margin: 0; }
                
                body { 
                    font-family: 'Inter', sans-serif; color: #1e293b; background-color: #fdfdfc; 
                    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239ba9b4' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
                    margin: 0; padding: 0; line-height: 1.8; 
                }
                
                .cover { 
                    height: 100vh; width: 100vw;
                    background-color: #0f172a; 
                    background-image: linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.95)), url('${coverBase64}');
                    background-size: cover; background-position: center;
                    color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; 
                    text-align: center; page-break-after: always; padding: 50px; box-sizing: border-box; 
                    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
                }
                
                /* FORÇANDO O TEXTO A FICAR MAIÚSCULO/CAPITALIZADO NA MARRA */
                .cover-subtitle { font-family: 'Inter', sans-serif; color: #FF6B35; font-size: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: 4px; margin-bottom: 25px; }
                .cover-title { font-family: 'Playfair Display', serif; font-size: 58px; font-weight: 700; margin: 0 0 30px 0; line-height: 1.1; text-shadow: 2px 2px 15px rgba(0,0,0,0.6); text-transform: capitalize; }
                .cover-client { font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 300; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 35px; }
                .cover-client strong { color: #FF6B35; font-weight: 600; font-size: 32px; display: block; margin-top: 10px; font-family: 'Playfair Display', serif; text-transform: capitalize; }
                .cover-logo { margin-top: auto; font-family: 'Inter', sans-serif; font-size: 13px; color: #94a3b8; letter-spacing: 3px; text-transform: uppercase; }

                .content-wrapper { padding: 40px 70px; } 
                
                .day-header { page-break-before: always; page-break-inside: avoid; margin-top: 40px; }
                .content-wrapper > .day-header:first-of-type { page-break-before: avoid; margin-top: 0; }
                
                /* Títulos Capitalizados para evitar minúsculas estranhas da IA */
                h2 { font-family: 'Playfair Display', serif; color: #0f172a; font-size: 32px; text-align: center; margin: 0; padding-top: 20px; text-transform: capitalize; }
                h2::after { content: ''; display: block; width: 60px; height: 3px; background-color: #FF6B35; margin: 20px auto 0; }
                
                h3 { font-family: 'Inter', sans-serif; color: #FF6B35; font-size: 20px; margin-top: 30px; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; text-transform: capitalize; }
                
                p, li { font-size: 16px; color: #334155; text-align: justify; margin-bottom: 15px; }
                a { color: #FF6B35; text-decoration: none; font-weight: 600; transition: 0.3s; }
                
                .img-container { width: 100%; text-align: center; margin: 25px 0 35px 0; }
                .day-image { width: 100%; max-height: 350px; object-fit: cover; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border: 6px solid white; background-color: #e2e8f0; }
                
                .quote { font-family: 'Playfair Display', serif; font-style: italic; color: #334155; text-align: center; margin: 40px 0; font-size: 24px; line-height: 1.5; padding: 30px; background-color: rgba(255,107,53,0.03); border-radius: 12px; border: 1px solid rgba(255,107,53,0.1); }
                .quote strong { font-family: 'Inter', sans-serif; color: #FF6B35; display: block; margin-top: 15px; font-size: 14px; text-transform: uppercase; font-style: normal; letter-spacing: 2px; }
                
                .dica-lucas { background-color: #ffffff; border-left: 4px solid #0f172a; padding: 25px 30px; margin: 40px 0; border-radius: 0 8px 8px 0; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04); page-break-inside: avoid; }
                .dica-lucas strong { font-family: 'Playfair Display', serif; color: #0f172a; display: block; margin-bottom: 12px; font-size: 20px; text-transform: capitalize; }
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

        console.log(`[LOG] Iniciando a impressão do PDF em ambiente seguro...`);

        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-web-security',
                '--disable-gpu',
                '--no-zygote',
                '--disable-dev-shm-usage'
            ] 
        });
        const page = await browser.newPage();
        
        await page.setContent(htmlTemplate, { waitUntil: 'load', timeout: 0 });
        
        // A TRAVA DE TEMPO ABSOLUTA: Obriga o robô a esperar 2.5 segundos.
        // Isso garante que o Google injetou a fonte 'Playfair' na página, impossibilitando a fonte feia.
        await page.evaluateHandle('document.fonts.ready');
        await new Promise(r => setTimeout(r, 2500));
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ 
            path: filePath, 
            format: 'A4', 
            printBackground: true 
        });
        await browser.close();

        const pdfUrl = `https://${req.get('host')}/pdfs/${fileName}`;
        console.log(`[LOG] SUCESSO ABSOLUTO! PDF gerado: ${pdfUrl}`);
        
        res.json({ pdfUrl });

    } catch (error) {
        console.error('[ERRO FATAL] Falha no servidor:', error);
        res.status(500).json({ error: 'Falha ao gerar o roteiro' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô do Lucas Janone rodando na porta ${PORT}`);
});