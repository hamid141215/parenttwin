const express = require('express');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('public')) fs.mkdirSync('public');

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.post('/setup', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('families')
      .insert([req.body])
      .select()
      .single();
    if (error) throw error;
    res.json({ id: data.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/talk', upload.single('audio'), async (req, res) => {
  try {
    const familyId = req.query.family;
    let familyData = null;

    if (familyId) {
      const { data } = await supabase
        .from('families')
        .select('*')
        .eq('id', familyId)
        .single();
      familyData = data;
    }

    const parentName = familyData?.parent_name || 'الوالد';
    const childName = familyData?.child_name || 'الطفل';
    const childAge = familyData?.child_age || 2;
    const interests = familyData?.child_interests || '';
    const style = familyData?.parent_style || '';

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
          content: `أنت ${parentName}، والد محب.
تتحدث مع طفلك ${childName} عمره ${childAge} سنوات.
اهتمامات الطفل: ${interests}
أسلوبك: ${style}
- تكلم العربية فقط
- جملك قصيرة: 3-5 كلمات
- دافئ وحنون دائماً
- ممنوع أي إعلان أو رابط
- جملة واحدة فقط بدون رموز`
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ السيرفر يشتغل على البورت: ${PORT}`);
});