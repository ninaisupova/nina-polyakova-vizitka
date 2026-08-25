/**
 * Защита персональных данных (152-ФЗ РФ)
 *
 * Принцип: ПДн (ФИО, телефон, email) шифруются на клиенте,
 * никогда не попадают в payload для ИИ и подставляются
 * в бриф / КП только локально после генерации.
 */
(function (global) {
  'use strict';

  const PII_KEYS = ['fullName', 'phone', 'email'];
  const PLACEHOLDERS = {
    fullName: '{{CLIENT_FULL_NAME}}',
    phone: '{{CLIENT_PHONE}}',
    email: '{{CLIENT_EMAIL}}'
  };

  const VAULT_KEY = 'np_pdn_vault_v1';
  const SESSION_KEY_ID = 'np_pdn_session_key';

  function bytesToBase64(bytes) {
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  async function getOrCreateKey() {
    const existing = sessionStorage.getItem(SESSION_KEY_ID);
    if (existing) {
      return crypto.subtle.importKey(
        'raw',
        base64ToBytes(existing),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    }

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const raw = await crypto.subtle.exportKey('raw', key);
    sessionStorage.setItem(SESSION_KEY_ID, bytesToBase64(new Uint8Array(raw)));
    return key;
  }

  async function encryptString(plain) {
    if (!plain) return null;
    const key = await getOrCreateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(String(plain));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    return {
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(cipher)),
      alg: 'AES-GCM-256'
    };
  }

  async function decryptPayload(payload) {
    if (!payload?.data || !payload?.iv) return '';
    const key = await getOrCreateKey();
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.data)
    );
    return new TextDecoder().decode(plain);
  }

  function normalizePhone(value) {
    return String(value || '').replace(/[^\d+]/g, '');
  }

  function validatePii({ fullName, phone, email }) {
    const errors = {};
    if (!fullName || String(fullName).trim().length < 2) {
      errors.fullName = 'Укажите ФИО';
    }
    const phoneDigits = normalizePhone(phone).replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      errors.phone = 'Укажите корректный телефон';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) {
      errors.email = 'Укажите корректный email';
    }
    return errors;
  }

  /** Сохраняет ПДн только в зашифрованном виде (sessionStorage). */
  async function storeEncryptedPii(pii) {
    const vault = {
      fullName: await encryptString(pii.fullName.trim()),
      phone: await encryptString(normalizePhone(pii.phone)),
      email: await encryptString(String(pii.email).trim().toLowerCase()),
      storedAt: new Date().toISOString(),
      purpose: 'substitution_only',
      aiTransfer: false
    };
    sessionStorage.setItem(VAULT_KEY, JSON.stringify(vault));
    return vault;
  }

  async function loadDecryptedPii() {
    const raw = sessionStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    try {
      const vault = JSON.parse(raw);
      return {
        fullName: await decryptPayload(vault.fullName),
        phone: await decryptPayload(vault.phone),
        email: await decryptPayload(vault.email)
      };
    } catch {
      clearVault();
      return null;
    }
  }

  function clearVault() {
    sessionStorage.removeItem(VAULT_KEY);
    sessionStorage.removeItem(SESSION_KEY_ID);
  }

  /**
   * Готовит данные для ИИ: ПДн удалены, вместо них — плейсхолдеры.
   * Этот объект — единственный допустимый payload для генерации.
   */
  function buildAiSafePayload(formData) {
    const safe = {
      projectType: formData.projectType || '',
      goal: formData.goal || '',
      audience: formData.audience || '',
      notes: formData.notes || '',
      client: {
        fullName: PLACEHOLDERS.fullName,
        phone: PLACEHOLDERS.phone,
        email: PLACEHOLDERS.email
      },
      meta: {
        piiExcluded: true,
        law: '152-FZ',
        note: 'Personal data must not be sent to AI models'
      }
    };

    // Защита от случайной утечки: вычищаем известные ПДн из текстовых полей
    const scrub = (text) => {
      let t = String(text || '');
      if (formData.fullName) {
        t = t.split(formData.fullName).join(PLACEHOLDERS.fullName);
      }
      if (formData.email) {
        t = t.split(formData.email).join(PLACEHOLDERS.email);
      }
      if (formData.phone) {
        const variants = [formData.phone, normalizePhone(formData.phone)];
        variants.forEach((v) => {
          if (v) t = t.split(v).join(PLACEHOLDERS.phone);
        });
      }
      return t;
    };

    safe.goal = scrub(safe.goal);
    safe.audience = scrub(safe.audience);
    safe.notes = scrub(safe.notes);
    return Object.freeze(safe);
  }

  /** Проверка: в payload нет реальных ПДн. */
  function assertNoPiiInPayload(payload, pii) {
    const dump = JSON.stringify(payload);
    const suspects = [pii.fullName, pii.email, normalizePhone(pii.phone), pii.phone]
      .filter(Boolean)
      .map((s) => String(s).trim())
      .filter((s) => s.length >= 3);

    for (const s of suspects) {
      if (dump.includes(s)) {
        throw new Error('ПДн обнаружены в данных для ИИ — отправка заблокирована');
      }
    }
    return true;
  }

  /** Локальная генерация черновика с плейсхолдерами (без ПДн). */
  function generateDraftWithPlaceholders(aiSafe) {
    const typeLabel = {
      site: 'сайт',
      bot: 'бот',
      app: 'приложение',
      other: 'digital-проект'
    }[aiSafe.projectType] || 'проект';

    const brief = [
      '# Бриф проекта',
      '',
      '## Клиент',
      `- ФИО: ${PLACEHOLDERS.fullName}`,
      `- Телефон: ${PLACEHOLDERS.phone}`,
      `- Email: ${PLACEHOLDERS.email}`,
      '',
      '## Задача',
      `Тип: ${typeLabel}`,
      '',
      '### Цель',
      aiSafe.goal || '—',
      '',
      '### Аудитория',
      aiSafe.audience || '—',
      '',
      '### Дополнительно',
      aiSafe.notes || '—',
      '',
      '## Подход',
      '01. Вайб — ощущение и стиль проекта',
      '02. Структура — сценарий и путь пользователя',
      '03. Реализация — сборка без шаблонности',
      '',
      '_Черновик сгенерирован без персональных данных (152-ФЗ)._'
    ].join('\n');

    const offer = [
      '# Коммерческое предложение',
      '',
      `Для: ${PLACEHOLDERS.fullName}`,
      `Контакты: ${PLACEHOLDERS.phone} · ${PLACEHOLDERS.email}`,
      '',
      '## Предмет',
      `Разработка ${typeLabel} с характером: визуал, UX и логика под задачу клиента.`,
      '',
      '## Что входит',
      '- Проработка вайба и структуры',
      '- Интерфейс и реализация',
      '- Сопровождение до запуска',
      '',
      '## Срок и условия',
      'Обсуждаются индивидуально после уточнения объёма.',
      '',
      '_Документ собран из AI-черновика без ПДн; контакты подставлены локально._'
    ].join('\n');

    return { brief, offer };
  }

  /** Подстановка расшифрованных ПДн в итоговые документы (только на клиенте). */
  function mergePiiIntoDocuments(drafts, pii) {
    const replaceAll = (text) => String(text)
      .split(PLACEHOLDERS.fullName).join(pii.fullName)
      .split(PLACEHOLDERS.phone).join(pii.phone)
      .split(PLACEHOLDERS.email).join(pii.email);

    return {
      brief: replaceAll(drafts.brief),
      offer: replaceAll(drafts.offer)
    };
  }

  function maskForDisplay(pii) {
    if (!pii) return null;
    const maskEmail = (e) => {
      const [u, d] = String(e).split('@');
      if (!d) return '•••';
      return `${u.slice(0, 1)}•••@${d}`;
    };
    const maskPhone = (p) => {
      const d = String(p).replace(/\D/g, '');
      if (d.length < 4) return '•••';
      return `+7 ••• ••• ${d.slice(-4, -2)} ${d.slice(-2)}`;
    };
    return {
      fullName: pii.fullName.replace(/(\S)\S+/g, '$1***'),
      phone: maskPhone(pii.phone),
      email: maskEmail(pii.email)
    };
  }

  global.PersonalDataGuard = {
    PII_KEYS,
    PLACEHOLDERS,
    validatePii,
    storeEncryptedPii,
    loadDecryptedPii,
    clearVault,
    buildAiSafePayload,
    assertNoPiiInPayload,
    generateDraftWithPlaceholders,
    mergePiiIntoDocuments,
    maskForDisplay
  };
})(window);
