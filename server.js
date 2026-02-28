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

        const prompt = `Você é Lucas Janone, um renomado especialista em viagens de luxo acessível. Crie um roteiro premium incrivelmente persuasivo e elegante.
        Cliente: ${nome} | Destino: ${destino} | Data: ${dataViagem} | Viajantes: ${numeroViajantes} | Orçamento: R$ ${orcamento} (EM REAIS) | Exigências: ${mustHaves}
        
        REGRAS DE FORMATAÇÃO E ELEGÂNCIA (OBRIGATÓRIO):
        - Responda APENAS com código HTML (sem as tags html, head ou body).
        - Use <h2> para separar os dias.
        - PROIBIDO USAR CAPS LOCK em frases ou títulos inteiros. Mantenha a elegância.
        - Use <h3> para os turnos: <h3>🌅 Manhã: [Atividade]</h3>, <h3>☀️ Tarde: [Atividade]</h3>, <h3>🌙 Noite: [Atividade]</h3>.
        - LINKS CLICÁVEIS: Mencionou hotel ou restaurante? Coloque link (tag <a>) para o site oficial ou TripAdvisor.
        - CITAÇÃO: Após a introdução, adicione uma frase inspiradora. <blockquote class="quote">"Frase" <br><strong>- Autor</strong></blockquote>
        
        ESTRUTURA DO CONTEÚDO:
        1. Boas-vindas calorosas ao ${nome}.
        2. A Citação inspiradora.
        3. Estratégia Financeira (EM REAIS).
        4. Roteiro Dia a Dia. Insira a frase: "Como eu sempre ensino aos meus alunos da Mentoria, o segredo de viajar bem é..."
        5. 3 Curiosidades locais exclusivas.
        6. A Dica de Ouro do Lucas.
        7. Convite elegante para a Mentoria de Viagens.`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent(prompt);
        let roteiroHTML = result.response.text();
        roteiroHTML = roteiroHTML.replace(/```html|```/g, '');

        // A MÁGICA: Pegando FOTOS REAIS da internet (Flickr) em milissegundos
        let imageCounter = 1;
        const destinoLimpo = encodeURIComponent(destino.trim().split(' ')[0]); // Pega a primeira palavra (ex: "Arraial") para a busca não falhar
        
        roteiroHTML = roteiroHTML.replace(/<h2(.*?)>(.*?)<\/h2>/g, (match) => {
            // Busca fotos reais de paisagens/pontos turísticos
            const imgUrl = `https://loremflickr.com/800/400/${destinoLimpo},landmark/all?lock=${imageCounter}`;
            imageCounter++;
            return `${match}\n<div class="img-container"><img class="day-image" src="${imgUrl}" alt="Foto incrível de ${destino}"></div>`;
        });

        // Foto real para a Capa
        const coverImageUrl = `https://loremflickr.com/1200/1600/${destinoLimpo},landscape/all?lock=100`;

        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap');
                
                @page { margin: 0; }
                
                body { 
                    font-family: 'Inter', sans-serif; color: #1e293b; background-color: #fdfdfc; 
                    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239ba9b4' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
                    margin: 0; padding: 0; line-height: 1.7; 
                }
                
                .cover { 
                    height: 100vh; width: 100vw;
                    background-color: #0f172a; 
                    background-image: linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.95)), url('${coverImageUrl}');
                    background-size: cover; background-position: center;
                    color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; 
                    text-align: center; page-break-after: always; padding: 50px; box-sizing: border-box; 
                    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
                }
                .cover-subtitle { font-family: 'Inter', sans-serif; color: #FF6B35; font-size: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: 4px; margin-bottom: 25px; }
                .cover-title { font-family: 'Playfair Display', serif; font-size: 58px; font-weight: 700; margin: 0 0 30px 0; line-height: 1.1; text-shadow: 2px 2px 15px rgba(0,0,0,0.6); }
                .cover-client { font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 300; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 35px; }
                .cover-client strong { color: #FF6B35; font-weight: 600; font-size: 32px; display: block; margin-top: 10px; font-family: 'Playfair Display', serif; }
                .cover-logo { margin-top: auto; font-family: 'Inter', sans-serif; font-size: 13px; color: #94a3b8; letter-spacing: 3px; text-transform: uppercase; }

                .content-wrapper { padding: 40px 70px; } 
                
                h2 { 
                    font-family: 'Playfair Display', serif; color: #0f172a; font-size: 32px; text-align: center;
                    margin-top: 0; margin-bottom: 30px; page-break-before: always; padding-top: 50px; 
                }
                h2::after { content: ''; display: block; width: 60px; height: 3px; background-color: #FF6B35; margin: 20px auto 0; }
                .content-wrapper h2:first-of-type { page-break-before: avoid; padding-top: 10px; }
                
                h3 { font-family: 'Inter', sans-serif; color: #FF6B35; font-size: 18px; letter-spacing: 1px; margin-top: 40px; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
                p, li { font-size: 15px; color: #334155; text-align: justify; }
                a { color: #FF6B35; text-decoration: none; font-weight: 600; transition: 0.3s; }
                
                .img-container { width: 100%; text-align: center; margin: 35px 0; page-break-inside: avoid; }
                .day-image { width: 100%; max-height: 380px; object-fit: cover; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border: 6px solid white; background-color: #e2e8f0; }
                
                .quote { font-family: 'Playfair Display', serif; font-style: italic; color: #334155; text-align: center; margin: 50px 0; font-size: 24px; line-height: 1.5; padding: 30px; background-color: rgba(255,107,53,0.03); border-radius: 12px; border: 1px solid rgba(255,107,53,0.1); }
                .quote strong { font-family: 'Inter', sans-serif; color: #FF6B35; display: block; margin-top: 15px; font-size: 14px; text-transform: uppercase; font-style: normal; letter-spacing: 2px; }
                .dica-lucas { background-color: #ffffff; border-left: 4px solid #0f172a; padding: 25px 30px; margin: 40px 0; border-radius: 0 8px 8px 0; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04); page-break-inside: avoid; }
                .dica-lucas strong { font-family: 'Playfair Display', serif; color: #0f172a; display: block; margin-bottom: 12px; font-size: 20px; }
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
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        
        // Agora o robô não precisa esperar quase nada, as fotos reais são rápidas!
        await page.setContent(htmlTemplate, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Espera curtinha só para garantir que as fotos desceram da internet
        await page.evaluate(async () => {
            const images = Array.from(document.querySelectorAll('img'));
            await Promise.all(images.map(img => {
                if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
                return new Promise((resolve) => {
                    img.addEventListener('load', resolve);
                    img.addEventListener('error', resolve); 
                    setTimeout(resolve, 3000); // Se passar de 3 segundos, ele imprime do jeito que está
                });
            }));
        });
        
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