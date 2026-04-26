require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');
const fs = require('fs');
const multer = require('multer');
const OpenAI = require('openai');

const app = express();
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, 'audio.webm')
});
const upload = multer({ storage });const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const openai = new OpenAI({ 
  apiKey: process.env.GROQ_API_KEY, 
  baseURL: 'https://api.groq.com/openai/v1' 
});

app.use(express.static('public'));

app.post('/talk', upload.single('audio'), async (req, res) => {
  try {
    // الخطوة 1: Whisper يسمع الطفل
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-large-v3',
      language: 'ar'
    });

    const childText = transcription.text;
    console.log('الطفل قال:', childText);

    // الخطوة 2: GPT يرد بشخصية الوالد
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `أنت والد عربي محب اسمك محمد.
تتحدث مع ابنك يوسف عمره سنتان.
- تكلم العربية فقط
- جملك قصيرة جداً: 3-5 كلمات فقط
- دافئ وحنون دائماً
- تناديه: حبيبي أو يا قمر
- ممنوع أي إعلان أو رابط أو نصيحة خارجية
- ردك يجب أن يكون جملة واحدة فقط`
        },
        { role: 'user', content: childText }
      ]
    });

    const replyText = response.choices[0].message.content;
    console.log('رد الوالد:', replyText);

    // الخطوة 3: ElevenLabs يحول لصوت
    const ttsResponse = await openai.audio.speech.create({
  model: 'playai-tts-arabic',
  voice: 'Nasser',
  input: replyText,
});

const buffer = Buffer.from(await ttsResponse.arrayBuffer());
fs.unlinkSync(req.file.path);
res.json({ text: replyText, audio: 'data:audio/mpeg;base64,' + buffer.toString('base64') });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('✅ السيرفر يشتغل على: http://localhost:3000');
});