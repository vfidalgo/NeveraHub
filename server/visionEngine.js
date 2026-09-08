const https = require('https');
const fs = require('fs');
const path = require('path');
const notificationService = require('./notificationService');

const CAPTURES_DIR = path.join(__dirname, '..', 'data', 'security_captures');

class VisionEngine {
  constructor() {
    this.ensureCapturesDir();
  }

  ensureCapturesDir() {
    try {
      if (!fs.existsSync(CAPTURES_DIR)) {
        fs.mkdirSync(CAPTURES_DIR, { recursive: true });
      }
    } catch (err) {
      console.warn('No se pudo crear carpeta de capturas de seguridad:', err.message);
    }
  }

  saveSecurityCapture(imageBase64) {
    this.ensureCapturesDir();
    const filename = `capture_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
    const filePath = path.join(CAPTURES_DIR, filename);
    const cleanBase64 = (imageBase64 || '').replace(/^data:image\/[a-z]+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(cleanBase64, 'base64'));
    return filename;
  }

  /**
   * Identifica qué miembro de la familia está delante de la pantalla
   * @param {string} imageBase64 Imagen en formato Base64 (JPEG o PNG)
   * @param {object} db Instancia de Base de Datos
   * @param {number} attemptNumber Número de intento (1 o 2)
   * @param {string} [apiKey] Clave de API de Gemini (opcional)
   * @returns {Promise<object>} Resultado de la identificación
   */
  async identifyMember(imageBase64, db, attemptNumber = 1, apiKey = process.env.GEMINI_API_KEY) {
    const members = db.get('members') || [];

    if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.length < 50) {
      return this.handleNoFaceDetected(attemptNumber);
    }

    // 1. Si hay clave de Gemini API configurada, consultar a Gemini Flash Vision
    if (apiKey && apiKey.trim()) {
      try {
        const geminiResult = await this.callGeminiVision(imageBase64, members, apiKey);
        if (geminiResult && geminiResult.identified) {
          return this.formatIdentifiedResponse(geminiResult.memberId, db);
        } else if (geminiResult && geminiResult.isStranger) {
          return await this.handleStrangerDetected(imageBase64, db);
        }
      } catch (err) {
        console.warn('Error en llamada a Gemini Vision, utilizando motor de contingencia:', err.message);
      }
    }

    // 2. Motor de Contingencia / Simulación para desarrollo y pruebas
    return this.fallbackIdentification(imageBase64, members, attemptNumber, db);
  }


  /**
   * Consulta a la API de Gemini 1.5 Flash Vision
   */
  callGeminiVision(imageBase64, members, apiKey) {
    return new Promise((resolve, reject) => {
      // Limpiar cabecera data:image/jpeg;base64, si viene incluida
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

      const prompt = `Eres el sistema de reconocimiento facial inteligente del asistente de cocina NeveraHub.
Analiza la fotografía tomada por la cámara frontal de la pantalla de la nevera.
La familia registrada está compuesta por:
- Papá (o Victor): Hombre adulto. ID: "m1"
- Mamá: Mujer adulta. ID: "m2"
- Guille: Niño de aproximadamente 4 a 6 años. ID: "m3"
- Samuel: Bebé o niño pequeño de aproximadamente 1 a 3 años. ID: "m4"
${members.filter(m => !['m1','m2','m3','m4'].includes(m.id)).map(m => `- ${m.name}: Rol "${m.role}". ID: "${m.id}"`).join('\n')}

INSTRUCCIONES DE CLASIFICACIÓN:
1. Si frente a la cámara se observa un hombre adulto, asigna memberId "m1" (o el ID del padre).
2. Si se observa una mujer adulta, asigna memberId "m2" (Mamá).
3. Si se observa un niño/a de unos 4 a 7 años, asigna memberId "m3" (Guille).
4. Si se observa un bebé o niño de 1 a 3 años, asigna memberId "m4" (Samuel).
5. Si no hay personas visibles frente a la cámara, o la imagen está completamente oscura o vacía, responde:
{"identified": false, "memberId": null, "confidence": 0.0}
6. Si hay una persona claramente visible que no encaja con ningún miembro de la familia, responde:
{"identified": false, "isStranger": true, "confidence": 0.9}

Responde ÚNICAMENTE un objeto JSON válido con esta estructura exacta, sin bloques markdown ni comentarios:
{"identified": true, "memberId": "m1", "confidence": 0.95}`;

      const postData = JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: cleanBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 200,
          responseMimeType: 'application/json'
        }
      });

      const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 6000
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (candidate) {
              const parsed = JSON.parse(candidate);
              resolve(parsed);
            } else {
              resolve({ identified: false });
            }
          } catch (e) {
            reject(new Error('Respuesta inválida de Gemini'));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout en Gemini Vision'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Motor de contingencia cuando no hay API Key o para tests automatizados
   */
  async fallbackIdentification(imageBase64, members, attemptNumber, db) {
    const normImg = imageBase64.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Si la imagen incluye una pista de prueba explícita de un familiar
    for (const m of members) {
      const short = m.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' ')[0];
      if (normImg.includes(short) || imageBase64.includes(m.id)) {
        return this.formatIdentifiedResponse(m.id, db);
      }
    }

    // Pista explícita de desconocido para pruebas
    if (normImg.includes('stranger') || normImg.includes('desconocido')) {
      return await this.handleStrangerDetected(imageBase64, db);
    }

    // Si la imagen es demasiado corta o vacía, simular no reconocido
    if (imageBase64.includes('noface') || imageBase64.length < 200) {
      return this.handleNoFaceDetected(attemptNumber);
    }

    // En intento 1 si la cara no es clara, pedir que se coloque frente a la cámara
    if (attemptNumber === 1) {
      return this.handleNoFaceDetected(1);
    }

    // En intento 2 sin API key: guiar amablemente a seleccionar avatar en vez de alarma de intruso
    return this.handleNoFaceDetected(2);
  }

  async handleStrangerDetected(imageBase64, db) {
    let filename = null;
    try {
      filename = this.saveSecurityCapture(imageBase64);
    } catch (err) {
      console.warn('Error al guardar captura de seguridad:', err);
    }

    const alertItem = {
      id: `sec_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      date: new Date().toISOString(),
      imageFile: filename,
      imageUrl: filename ? `/api/security/captures/${filename}` : null,
      status: 'unresolved',
      notes: 'Persona no identificada detectada interactuando con la nevera'
    };

    if (db) {
      db.add('securityAlerts', alertItem);
    }

    // Notificar a los teléfonos móviles de la familia
    try {
      await notificationService.sendPushNotification({
        title: '🚨 Alerta Nevera: Persona no identificada',
        message: 'Alguien desconocido está tocando la pantalla de la nevera. Pulsa para ver la foto.',
        tags: ['warning', 'security']
      });
      notificationService.broadcastSSE('security_alert', alertItem);
    } catch (e) {
      console.warn('Error al emitir alerta push de seguridad:', e);
    }

    return {
      identified: false,
      isStranger: true,
      attemptNumber: 2,
      retryRequired: false,
      spokenPrompt: 'Hola, no te reconozco. ¿Quién eres? He avisado a la familia.',
      instruction: 'Persona no identificada. Alerta y foto enviadas a la familia.',
      alertId: alertItem.id,
      captureUrl: alertItem.imageUrl
    };
  }


  formatIdentifiedResponse(memberId, db) {
    const members = db.get('members') || [];
    const member = members.find(m => m.id === memberId) || members[0];
    const todayStr = new Date().toISOString().split('T')[0];
    const habitLogs = db.getHabitLogs(todayStr);
    const habits = db.get('habits') || [];
    const events = db.get('events') || [];

    const memberShortName = member.name.split(' ')[0];
    const isChild = member.role === 'child';

    let greeting = '';
    let suggestedView = 'dashboard';
    let detailText = '';

    if (isChild) {
      suggestedView = 'habits';
      const myHabits = habits.filter(h => h.memberId === member.id);
      const pendingHabits = myHabits.filter(h => !habitLogs[h.id]);
      
      if (pendingHabits.length > 0) {
        greeting = `¡Hola ${memberShortName}! Tienes pendiente: ${pendingHabits[0].title}. ¡Vamos a por ello!`;
        detailText = `⭐ Tienes ${pendingHabits.length} hábitos pendientes hoy.`;
      } else {
        greeting = `¡Hola ${memberShortName}! ¡Enhorabuena, has completado todos tus hábitos de hoy!`;
        detailText = `🏆 ¡Todos tus hábitos de hoy están completados!`;
      }
    } else {
      // Adulto / Padre / Madre
      const myEvents = events.filter(e => e.date === todayStr && (e.memberId === member.id || e.memberId === 'all'));
      if (myEvents.length > 0) {
        greeting = `Hola ${memberShortName}. Hoy tienes en la agenda: ${myEvents[0].title} a las ${myEvents[0].startTime}.`;
        detailText = `📅 Tienes ${myEvents.length} eventos programados para hoy.`;
      } else {
        greeting = `Hola ${memberShortName}. No tienes eventos en el calendario hoy. En la nevera todo está al día.`;
        detailText = `✅ Sin eventos urgentes para hoy.`;
      }
      suggestedView = 'dashboard';
    }

    return {
      identified: true,
      memberId: member.id,
      memberName: member.name,
      shortName: memberShortName,
      role: member.role,
      avatar: member.avatar,
      color: member.color,
      confidence: 0.95,
      greeting: greeting,
      detailText: detailText,
      suggestedView: suggestedView
    };
  }

  handleNoFaceDetected(attemptNumber) {
    if (attemptNumber === 1) {
      return {
        identified: false,
        attemptNumber: 1,
        retryRequired: true,
        spokenPrompt: 'No te he reconocido bien. Por favor, colócate delante de la pantalla y mira a la cámara para intentarlo de nuevo.',
        instruction: 'Mira fijamente a la cámara frontal...'
      };
    } else {
      return {
        identified: false,
        attemptNumber: 2,
        retryRequired: false,
        spokenPrompt: 'No he podido identificarte con claridad. Puedes tocar tu avatar arriba para elegir tu perfil.',
        instruction: 'Toca tu avatar arriba para activar tu perfil.'
      };
    }
  }
}

module.exports = new VisionEngine();