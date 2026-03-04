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

const delay = ms => new Promise(res => setTimeout(res, ms));

// Função para formatar o nome do cliente corretamente
const formatarNome = (str) => {
    if (!str) return "";
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// O FAXINEIRO TIPOGRÁFICO: Força os títulos a ficarem elegantes, mesmo que a IA erre
const limparCaixaAlta = (html) => {
    return html.replace(/<h([23]).*?>(.*?)<\/h\1>/g, (match, tag, content) => {
        // Converte o título todo para minúsculo e depois capitaliza a primeira letra de cada palavra
        let textoElegante = content.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
        return `<h${tag}>${textoElegante}</h${tag}>`;
    });
};

// MOTOR DE IMAGENS: Com Plano B Inteligente (Sem Neve na Praia)
async function getBase64Image(prompt, destinoPlanoB, width, height) {
    try {
        const seed = Math.floor(Math.random() * 999999);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
        
        const response = await fetch(url, { 
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });
        
        if (!response.ok) throw new Error(`Bloqueio: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.warn(`[AVISO] IA bloqueada. Puxando foto real do destino: ${destinoPlanoB}...`);
        try {
            // PLANO B SEGURO: Puxa uma foto real atrelada AO DESTINO (ex: Angra, Dubai)
            const seed = Math.floor(Math.random() * 1000);
            const fallbackUrl = `https://loremflickr.com/${width}/${height}/${encodeURIComponent(destinoPlanoB)},landscape/all?lock=${seed}`;
            const res = await fetch(fallbackUrl, { timeout: 10000 });
            const arr = await res.arrayBuffer();
            return `data:image/jpeg;base64,${Buffer.from(arr).toString('base64')}`;
        } catch (fatalError) {
            // Plano C extremo: Fundo cinza chique (melhor que uma foto errada)
            return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        }
    }
}

app.post('/api/gerar-roteiro', async (req, res) => {
    try {
        const { nome, dataViagem, numeroViajantes, destino, orcamento, mustHaves } = req.body;
        const nomeCliente = formatarNome(nome);
        
        console.log(`[LOG] Iniciando Roteiro de Elite para: ${nomeCliente} - Destino: ${destino}`);

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

        const prompt = `Você é Lucas Janone, curador de viagens de alto luxo (estilo agência Teresa Perez Tours). Crie um roteiro premium.
        Seu tom de voz deve ser muito elegante, porém ACOLHEDOR e acolhedor (não seja arrogante ou pomposo demais).
        
        Cliente: ${nomeCliente} | Destino: ${destino} | Data: ${dataViagem} | Viajantes: ${numeroViajantes} | Orçamento: R$ ${orcamento} (EM REAIS) | Exigências: ${mustHaves}
        
        REGRAS DE CÓDIGO E FORMATAÇÃO:
        - Responda APENAS com HTML limpo.
        - EXTREMAMENTE PROIBIDO usar texto todo em MAIÚSCULAS. Escreva como um humano normal (Apenas a primeira letra maiúscula).
        - Use <h2> para os dias (Ex: <h2>Dia 1: Chegada no Paraíso</h2>).
        - Use <h3> para os turnos (Ex: <h3>Manhã: Descobertas</h3>).
        - CITAÇÃO: Após a introdução, use <blockquote class="quote">"Frase inspiradora" <br><strong>— Autor</strong></blockquote>
        
        ESTRUTURA:
        1. Carta de boas-vindas amigável e exclusiva a ${nomeCliente}.
        2. A Citação.
        3. Estratégia de Investimento em Experiências (EM REAIS).
        4. Roteiro Dia a Dia (insira naturalmente a frase: "Como eu sempre ensino aos meus alunos da Mentoria, o verdadeiro luxo está em...").
        5. 3 Segredos Locais (Curiosidades).
        6. A Dica de Ouro do Lucas.
        7. Convite elegante para a Mentoria de Viagens.`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent(prompt);
        let roteiroHTML = result.response.text();
        roteiroHTML = roteiroHTML.replace(/```html|```/g, '');
        
        // O ROBÔ INTERCEPTA E LIMPA QUALQUER CAIXA ALTA DA IA
        roteiroHTML = limparCaixaAlta(roteiroHTML);

        console.log(`[LOG] Baixando imagens. Bloqueando fotos fora de contexto...`);
        const temas = ["beautiful landscape", "famous landmark", "stunning scenery", "beautiful nature or city view"];
        const destinoFormatado = destino.trim();
        const destinoPlanoB = destinoFormatado.split(',')[0]; // Pega só o nome da cidade principal para não confundir o buscador de fotos
        
        const partes = roteiroHTML.split(/(<h2.*?>.*?<\/h2>)/g);
        let novoHTML = "";
        let imageCounter = 0;
        
        for (let parte of partes) {
            if (parte.startsWith('<h2')) {
                const temaAtual = temas[imageCounter % temas.length];
                const promptFoto = `${temaAtual} in ${destinoFormatado} cinematic travel photography highly detailed 4k no text`;
                
                console.log(`[LOG] Processando imagem ${imageCounter + 1}...`);
                const base64Img = await getBase64Image(promptFoto, destinoPlanoB, 800, 450);
                
                novoHTML += `\n<div class="day-header">\n${parte}\n<div class="img-container"><img class="day-image" src="${base64Img}" alt="Visual Exclusivo de ${destinoPlanoB}"></div>\n</div>\n`;
                
                imageCounter++;
                await delay(2000); // Pausa sagrada para não tomar bloqueio da IA
            } else {
                novoHTML += parte;
            }
        }
        roteiroHTML = novoHTML;

        console.log(`[LOG] Gerando a Capa...`);
        const coverBase64 = await getBase64Image(`beautiful cinematic luxury travel photography ${destinoFormatado} famous landmark 4k no text`, destinoPlanoB, 900, 1200);

        // CSS "OLD MONEY" AJUSTADO PARA NUNCA QUEBRAR A CAPA
        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Cinzel:ital,wght@0,400;0,700;1,400&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
            
            <style>
                :root {
                    --navy: #0A1128;
                    --gold: #C5A059;
                    --text: #2C3E50;
                    --bg: #FAFAFA;
                }

                @page { margin: 0; }
                
                body { 
                    font-family: 'Lato', sans-serif; 
                    color: var(--text); 
                    background-color: var(--bg); 
                    margin: 0; padding: 0; line-height: 1.8; 
                }
                
                /* CAPA BLINDADA CONTRA QUEBRA DE PÁGINA */
                .cover { 
                    height: 100vh; width: 100vw;
                    max-height: 100vh; overflow: hidden; /* Proíbe o conteúdo de vazar */
                    background-color: var(--navy); 
                    background-image: linear-gradient(rgba(10, 17, 40, 0.65), rgba(10, 17, 40, 0.95)), url('${coverBase64}');
                    background-size: cover; background-position: center;
                    color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; 
                    text-align: center; page-break-after: always; padding: 40px; box-sizing: border-box; 
                    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
                }
                
                .cover-subtitle { font-family: 'Lato', sans-serif; color: var(--gold); font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 5px; margin-bottom: 25px; }
                .cover-title { font-family: 'Cinzel', serif; font-size: 52px; font-weight: 700; margin: 0 0 35px 0; line-height: 1.2; text-shadow: 2px 2px 20px rgba(0,0,0,0.8); }
                
                .cover-client-box { border-top: 1px solid rgba(197, 160, 89, 0.4); border-bottom: 1px solid rgba(197, 160, 89, 0.4); padding: 20px 0; margin-top: 15px; width: 70%; }
                .cover-client { font-family: 'Lato', sans-serif; font-size: 15px; font-weight: 300; color: #E0E0E0; text-transform: uppercase; letter-spacing: 2px; }
                .cover-client strong { color: var(--gold); font-weight: 700; font-size: 26px; display: block; margin-top: 5px; font-family: 'Cinzel', serif; letter-spacing: 1px;}
                
                .cover-logo { margin-top: auto; font-family: 'Lato', sans-serif; font-size: 11px; color: rgba(255,255,255,0.5); letter-spacing: 3px; text-transform: uppercase; padding-bottom: 20px; }

                /* CONTEÚDO REFINADO */
                .content-wrapper { padding: 50px 80px; } 
                
                .day-header { page-break-before: always; page-break-inside: avoid; margin-top: 40px; }
                .content-wrapper > .day-header:first-of-type { page-break-before: avoid; margin-top: 0; }
                
                h2 { 
                    font-family: 'Cinzel', serif; color: var(--navy); font-size: 32px; text-align: center; 
                    margin: 0; padding-top: 20px; font-weight: 700; text-transform: none; /* A limpeza já foi feita no JS */
                }
                h2::after { 
                    content: ''; display: block; width: 80px; height: 1px; 
                    border-top: 1px solid var(--gold); border-bottom: 1px solid var(--gold); 
                    padding-bottom: 2px; margin: 25px auto 0; 
                }
                
                h3 { 
                    font-family: 'Cinzel', serif; color: var(--gold); font-size: 22px; 
                    margin-top: 40px; margin-bottom: 15px; 
                    border-bottom: 1px solid #EAEAEA; padding-bottom: 10px; font-weight: 700; text-transform: none;
                }
                
                p, li { font-size: 15px; color: var(--text); text-align: justify; margin-bottom: 18px; font-weight: 300; }
                a { color: var(--gold); text-decoration: none; font-weight: 700; transition: 0.3s; border-bottom: 1px solid transparent; }
                
                /* IMAGENS FORMATO CINEMA */
                .img-container { width: 100%; text-align: center; margin: 35px 0; }
                .day-image { width: 100%; max-height: 400px; object-fit: cover; border-radius: 4px; box-shadow: 0 15px 35px rgba(10, 17, 40, 0.08); }
                
                /* CITAÇÃO DE REVISTA */
                .quote { 
                    font-family: 'Cinzel', serif; font-style: italic; color: var(--navy); text-align: center; 
                    margin: 50px 0; font-size: 24px; line-height: 1.4; padding: 40px; 
                    background-color: #FFFFFF; border: 1px solid #EAEAEA; box-shadow: 0 10px 30px rgba(0,0,0,0.02);
                }
                .quote strong { font-family: 'Lato', sans-serif; color: var(--gold); display: block; margin-top: 20px; font-size: 13px; text-transform: uppercase; font-style: normal; letter-spacing: 3px; font-weight: 700; }
                
                /* CAIXA DE DICAS ELEGANTES */
                .dica-lucas { 
                    background-color: #FFFFFF; border: 1px solid var(--gold); padding: 35px 40px; 
                    margin: 50px 0; box-shadow: 0 10px 30px rgba(197, 160, 89, 0.05); page-break-inside: avoid;
                }
                .dica-lucas strong { font-family: 'Cinzel', serif; color: var(--navy); display: block; margin-bottom: 15px; font-size: 22px; font-weight: 700; }
            </style>
        </head>
        <body>
            <div class="cover">
                <div class="cover-subtitle">Plano de Viagem Exclusivo</div>
                <h1 class="cover-title">A Essência de<br>${destinoPlanoB}</h1>
                <div class="cover-client-box">
                    <div class="cover-client">Preparado sob medida para<br><strong>${nomeCliente}</strong></div>
                </div>
                <div class="cover-logo">Lucas Janone • Mentoria de Viagens Premium</div>
            </div>
            <div class="content-wrapper">
                ${roteiroHTML}
            </div>
        </body>
        </html>`;

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
        console.error('[ERRO FATAL]', error);
        res.status(500).json({ error: 'Falha ao gerar o roteiro' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô do Lucas Janone rodando na porta ${PORT}`);
});