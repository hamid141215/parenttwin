const express = require('express');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const OpenAI = require('openai');

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('public')) fs.mkdirSync('public');

const app = express();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, 'audio.webm')
});
const upload = multer({ storage });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const openai = new OpenAI({ 
  apiKey: process.env.GROQ_API_KEY, 
  baseURL: 'https://api.groq.com/openai/v1' 
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.post('/talk', upload.single('audio'), async (req, res) => {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-large-v3',
      language: 'ar'
    });

    const childText = transcription.text;
    console.log('الطفل قال:', childText);

    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `أنت والد عربي محب اسمك محمد.
تتحدث مع ابنك يوسف عمره سنتان.
- تكلم العربية الفصحى البسيطة فقط
- جملك قصيرة جداً: 3-5 كلمات فقط
- دافئ وحنون دائماً
- تناديه: حبيبي أو يا قمر
- ممنوع أي إعلان أو رابط أو نصيحة
- ردك جملة واحدة فقط بدون أي رموز`
        },
        { role: 'user', content: childText }
      ]
    });

    const replyText = response.choices[0].message.content;
    console.log('رد الوالد:', replyText);

    const ttsResponse = await groq.audio.speech.create({
      model: 'canopylabs/orpheus-arabic-saudi',
      voice: 'fahad',
      input: replyText,
      response_format: 'wav'
    });

    const buffer = Buffer.from(await ttsResponse.arrayBuffer());
    fs.unlinkSync(req.file.path);

    res.json({ 
      text: replyText, 
      audio: 'data:audio/wav;base64,' + buffer.toString('base64') 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ السيرفر يشتغل على: http://localhost:3000');
});