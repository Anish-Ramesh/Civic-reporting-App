// Client-side AI utilities using Google Generative AI (Gemini)
// Requires env var: VITE_GEMINI_API_KEY

let genAI = null;

// Provider selection via env
const PROVIDER = (import.meta?.env?.VITE_AI_PROVIDER || 'gemini').toLowerCase();
const OPENROUTER_API_KEY = import.meta?.env?.VITE_OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = import.meta?.env?.VITE_OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_FALLBACK_MODEL = import.meta?.env?.VITE_OPENROUTER_FALLBACK_MODEL || 'deepseek/deepseek-v3.1';

async function ensureGenAI() {
  if (genAI) return genAI;
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing VITE_GEMINI_API_KEY');
  const mod = await import('@google/generative-ai');
  genAI = new mod.GoogleGenerativeAI(apiKey);
  return genAI;
}

async function blobToInlineData(blob, mime) {
  // Use FileReader to avoid stack overflows from spreading large arrays
  const dataUrl = await new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
  const [prefix, base64] = String(dataUrl).split(',', 2);
  const detectedMime = prefix.match(/^data:(.*?);base64$/)?.[1] || mime || blob.type || 'image/jpeg';
  return {
    inlineData: {
      data: base64,
      mimeType: detectedMime
    }
  };
}

async function blobToDataUrl(blob, mime) {
  const { inlineData } = await blobToInlineData(blob, mime);
  const m = inlineData.mimeType || 'image/jpeg';
  return `data:${m};base64,${inlineData.data}`;
}

export async function analyzeMedia({ photos = [], videoSnapshot = null }) {
  // photos: Blob[] (images), videoSnapshot: Blob (image) optional
  const ai = await ensureGenAI();
  const model = ai.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    generationConfig: {
      temperature: 0.2,  // Slightly creative but mostly focused
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 1024,
    },
  });

  const systemPrompt = [
    'You are an AI assistant that analyzes images/videos of civic infrastructure issues.',
    'You will be provided with one or more media items (photos or video snapshots) to analyze.',
    'Each media item will be clearly marked with [PHOTO] or [VIDEO_SNAPSHOT] before it.',
    '',
    'For EACH media item, analyze it independently and provide a concise paragraph.',
    'If multiple media are provided, keep paragraphs simple and separate them with a single blank line (\\n\\n).',
    '',
    'Return ONLY valid JSON with these fields:',
    '{',
    '  "descriptionVideo": string,   // paragraph for video snapshot, or empty string if no video',
    '  "descriptionPhotos": string,  // paragraph for photos, or empty string if no photos',
    '  "issueType": string,          // most specific applicable type (see list below), or "other" if uncertain',
    '  "mentionedLocation": string   // optional textual location if visible, else empty string',
    '}',
    '',
    'Guidance for the paragraphs:',
    '- Begin the video paragraph with "Video: " (only if video provided).',
    '- Begin the photos paragraph with "Photos: " (only if photos provided).',
    '- Mention type/severity, approximate size, safety concerns, and visible location clues.',
    '',
    'When deciding issueType: If the video shows no civic issue but the photos do, choose the issue type from the photos.',
    'Valid issue types include:',
    '   - pothole: Holes or depressions in the road surface',
    '   - garbage: Accumulated trash or illegal dumping',
    '   - street_light: Malfunctioning or broken street lights',
    '   - water_leakage: Leaking water pipes or flooding',
    '   - road_damage: Cracks, broken pavement, or damaged road surface',
    '   - drainage: Clogged or overflowing drains',
    '   - illegal_dumping: Unauthorized waste disposal',
    '',
    'Return ONLY valid JSON, no other text or markdown.'
  ].join('\n');

  // Build parts array with system prompt
  const parts = [{ text: systemPrompt }];
  
  // Process photos and video snapshot separately
  const mediaContexts = [];
  
  // Add photos first
  for (const photo of photos.slice(0, 3)) {
    mediaContexts.push({
      type: 'photo',
      data: await blobToInlineData(photo)
    });
  }
  
  // Add video snapshot if exists
  if (videoSnapshot) {
    mediaContexts.push({
      type: 'video_snapshot',
      data: await blobToInlineData(videoSnapshot)
    });
  }
  
  // Add media to parts with context
  for (const media of mediaContexts) {
    parts.push({
      text: `[${media.type.toUpperCase()}]`
    });
    parts.push(media.data);
  }

  try {
    console.log('Sending to AI model with', mediaContexts.length, 'media items');

    // If provider is explicitly set to openrouter, go there first
    if (PROVIDER === 'openrouter') {
      return await analyzeWithOpenRouter({ photos, videoSnapshot, mediaContexts, systemPrompt });
    }

    // Default to Gemini first
    try {
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts }
        ],
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ]
      });
      const response = result.response;
      if (!response) throw new Error('No response from AI model');
      const text = response.text().trim();
      console.log('Raw AI response:', text);
      return parseStructuredJson(text, mediaContexts);
    } catch (err) {
      // If Gemini is rate limited or fails, try OpenRouter if key is available
      const is429 = (err?.message || '').includes('429') || (err?.name || '').includes('Quota');
      if ((is429 || PROVIDER === 'fallback') && OPENROUTER_API_KEY) {
        console.warn('Gemini failed or quota exceeded. Falling back to OpenRouter...');
        return await analyzeWithOpenRouter({ photos, videoSnapshot, mediaContexts, systemPrompt });
      }
      throw err;
    }
  } catch (err) {
    console.error('AI analysis error:', err);
    console.error('Error details:', { name: err?.name, message: err?.message, stack: err?.stack });
    return {
      description: 'Could not analyze media. Please describe the issue manually.',
      issueType: 'other',
      mentionedLocation: ''
    };
  }
}

// Helper to parse/clean JSON-like output text
function parseStructuredJson(text, mediaContexts) {
  let cleanText = String(text || '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!(cleanText.startsWith('{') && cleanText.endsWith('}'))) {
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanText = jsonMatch[0];
  }
  const parsed = JSON.parse(cleanText);
  return finalizeParsed(parsed, mediaContexts);
}

function finalizeParsed(parsed, mediaContexts) {
  const hasVideo = mediaContexts?.some(m => m.type === 'video_snapshot');
  const hasPhotos = mediaContexts?.some(m => m.type === 'photo');

  const descRaw = String(parsed.description || '').trim();
  const descVideo = String(parsed.descriptionVideo || '').trim();
  const descPhotos = String(parsed.descriptionPhotos || '').trim();

  let parts = [];
  if (hasVideo && descVideo) parts.push(descVideo);
  if (hasPhotos && descPhotos) parts.push(descPhotos);

  let description = parts.join('\n\n').trim();
  if (!description) description = descRaw || 'Could not analyze media. Please describe the issue manually.';

  const resultObj = {
    description,
    issueType: String(parsed.issueType || 'other').toLowerCase().trim(),
    mentionedLocation: String(parsed.mentionedLocation || '').trim(),
  };
  console.log('Processed AI response:', resultObj);
  return resultObj;
}

async function analyzeWithOpenRouter({ photos, videoSnapshot, mediaContexts, systemPrompt }, model = OPENROUTER_MODEL) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  console.log(`Using OpenRouter model: ${model}`);

  // Build OpenAI-style messages with text and image_url entries
  const content = [{ type: 'text', text: systemPrompt }];
  // Add markers and images as data URLs
  for (const media of mediaContexts) {
    content.push({ type: 'text', text: `[${media.type.toUpperCase()}]` });
    let dataUrl;
    if (media.data?.inlineData?.data) {
      const mime = media.data.inlineData.mimeType || 'image/jpeg';
      dataUrl = `data:${mime};base64,${media.data.inlineData.data}`;
    } else {
      continue;
    }
    content.push({ type: 'image_url', image_url: { url: dataUrl } });
  }

  const body = {
    model: model,
    messages: [ { role: 'user', content } ],
    temperature: 0.2,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'),
      'X-Title': 'Civic Report',
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    // If primary model fails and we haven't tried fallback yet, attempt fallback
    if (model === OPENROUTER_MODEL && OPENROUTER_FALLBACK_MODEL) {
      console.warn(`Primary model ${model} failed (${res.status}), trying fallback ${OPENROUTER_FALLBACK_MODEL}...`);
      return analyzeWithOpenRouter({ photos, videoSnapshot, mediaContexts, systemPrompt }, OPENROUTER_FALLBACK_MODEL);
    }
    throw new Error(`OpenRouter error ${res.status}: ${txt}`);
  }
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content || '';
  console.log('Raw OpenRouter response:', text);
  return parseStructuredJson(text, mediaContexts);
}

export async function extractVideoSnapshot(videoBlob) {
  if (!(videoBlob instanceof Blob)) {
    throw new Error('Invalid video blob provided');
  }

  const url = URL.createObjectURL(videoBlob);
  const video = document.createElement('video');
  
  const drawFrame = (canvas, ctx, w, h) => {
    ctx.drawImage(video, 0, 0, w, h);
    return canvas;
  };
  
  const frameLooksBlank = (ctx, w, h) => {
    // Sample a small grid of pixels to estimate variance/brightness
    const sampleW = 64, sampleH = 36;
    const tmp = document.createElement('canvas');
    tmp.width = sampleW; tmp.height = sampleH;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, sampleW, sampleH);
    const { data } = tctx.getImageData(0, 0, sampleW, sampleH);
    let sum = 0, sumSq = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      sum += lum;
      sumSq += lum * lum;
    }
    const n = data.length / 4;
    const mean = sum / n;
    const variance = (sumSq / n) - (mean * mean);
    // Consider blank if very dark or very low variance (all-black or all-same)
    return mean < 8 || variance < 30;
  };
  
  try {
    // Set video source and attributes
    video.src = url;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    
    // Wait for video to load metadata
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Video metadata loading timed out'));
      }, 10000);
      
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve();
      };
      
      video.onerror = (err) => {
        clearTimeout(timeout);
        console.error('Video error:', err);
        reject(new Error(`Failed to load video: ${err.message || 'Unknown error'}`));
      };
    });
    
    const duration = Math.max(1, video.duration || 1);
    const tryTimes = [Math.min(0.5, duration * 0.1), duration * 0.25, duration * 0.5];
    
    // Create canvas with video dimensions
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context from canvas');
    
    for (const t of tryTimes) {
      video.currentTime = Math.min(t, duration - 0.01);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video seek timed out')), 5000);
        video.onseeked = () => { clearTimeout(timeout); resolve(); };
        video.onerror = (err) => { clearTimeout(timeout); reject(err); };
      });
      drawFrame(canvas, ctx, width, height);
      if (!frameLooksBlank(ctx, width, height)) {
        break;
      }
    }
    
    // Convert canvas to JPEG blob
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Failed to create image blob from video frame'));
          resolve(blob);
        },
        'image/jpeg',
        0.85
      );
    });
  } catch (error) {
    console.error('Error extracting video snapshot:', error);
    throw error;
  } finally {
    // Clean up
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
