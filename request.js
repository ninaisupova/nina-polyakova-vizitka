/**
 * Заявка на бриф / КП с изоляцией ПДн от ИИ-генерации.
 */
(function () {
  'use strict';

  const form = document.getElementById('request-form');
  if (!form || !window.PersonalDataGuard) return;

  const Guard = window.PersonalDataGuard;
  const statusEl = document.getElementById('request-status');
  const previewEl = document.getElementById('request-preview');
  const auditEl = document.getElementById('request-audit');
  const consent = document.getElementById('request-consent');

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.textContent = message || '';
    statusEl.dataset.type = type || '';
  }

  function showFieldErrors(errors) {
    form.querySelectorAll('[data-error-for]').forEach((el) => {
      const key = el.getAttribute('data-error-for');
      el.textContent = errors[key] || '';
    });
  }

  function readForm() {
    const data = new FormData(form);
    return {
      fullName: String(data.get('fullName') || ''),
      phone: String(data.get('phone') || ''),
      email: String(data.get('email') || ''),
      projectType: String(data.get('projectType') || ''),
      goal: String(data.get('goal') || ''),
      audience: String(data.get('audience') || ''),
      notes: String(data.get('notes') || '')
    };
  }

  function renderPreview(finalDocs, audit) {
    if (!previewEl) return;
    previewEl.hidden = false;
    previewEl.innerHTML = `
      <div class="request-preview__head">
        <h3>Итоговые документы</h3>
        <p>ПДн подставлены локально после генерации. В ИИ они не передавались.</p>
      </div>
      <div class="request-preview__grid">
        <article>
          <h4>Бриф</h4>
          <pre class="request-doc">${escapeHtml(finalDocs.brief)}</pre>
        </article>
        <article>
          <h4>Коммерческое предложение</h4>
          <pre class="request-doc">${escapeHtml(finalDocs.offer)}</pre>
        </article>
      </div>
    `;

    if (auditEl) {
      auditEl.hidden = false;
      auditEl.innerHTML = `
        <h4>Журнал обработки (локально)</h4>
        <ul>
          <li>ПДн зашифрованы: <strong>AES-GCM-256</strong></li>
          <li>Передача в ИИ: <strong>нет</strong></li>
          <li>В генерации использовались плейсхолдеры: <code>${Guard.PLACEHOLDERS.fullName}</code>, <code>${Guard.PLACEHOLDERS.phone}</code>, <code>${Guard.PLACEHOLDERS.email}</code></li>
          <li>Подстановка после генерации: <strong>да</strong></li>
          <li>Маска для отображения: ${escapeHtml(audit.masked.fullName)} · ${escapeHtml(audit.masked.phone)} · ${escapeHtml(audit.masked.email)}</li>
        </ul>
      `;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('', '');
    showFieldErrors({});

    if (!consent?.checked) {
      setStatus('Нужно согласие на обработку персональных данных.', 'error');
      return;
    }

    const data = readForm();
    const errors = Guard.validatePii(data);
    if (Object.keys(errors).length) {
      showFieldErrors(errors);
      setStatus('Проверьте поля с персональными данными.', 'error');
      return;
    }

    if (!data.goal.trim()) {
      showFieldErrors({ goal: 'Опишите задачу проекта' });
      setStatus('Заполните описание проекта.', 'error');
      return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    setStatus('Шифруем ПДн и готовим безопасный запрос…', 'info');

    try {
      // 1. ПДн только в зашифрованное хранилище сессии
      await Guard.storeEncryptedPii({
        fullName: data.fullName,
        phone: data.phone,
        email: data.email
      });

      // 2. Payload для ИИ — без реальных ПДн
      const aiSafe = Guard.buildAiSafePayload(data);
      Guard.assertNoPiiInPayload(aiSafe, data);

      // 3. Генерация черновика только с плейсхолдерами
      setStatus('Генерируем бриф и КП без персональных данных…', 'info');
      await new Promise((r) => setTimeout(r, 450));
      const draft = Guard.generateDraftWithPlaceholders(aiSafe);

      if (
        draft.brief.includes(data.fullName) ||
        draft.offer.includes(data.email)
      ) {
        throw new Error('Черновик содержит ПДн — генерация остановлена');
      }

      // 4. Подстановка ПДн локально после генерации
      const pii = await Guard.loadDecryptedPii();
      if (!pii) throw new Error('Не удалось расшифровать ПДн для подстановки');

      const finalDocs = Guard.mergePiiIntoDocuments(draft, pii);
      const masked = Guard.maskForDisplay(pii);

      renderPreview(finalDocs, { masked, aiSafe });
      setStatus('Готово. ПДн не передавались в ИИ и подставлены только в итоговый результат.', 'success');
      form.reset();
      if (consent) consent.checked = false;
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Ошибка безопасной обработки данных.', 'error');
      Guard.clearVault();
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  form.querySelector('[data-clear-pdn]')?.addEventListener('click', () => {
    Guard.clearVault();
    if (previewEl) previewEl.hidden = true;
    if (auditEl) auditEl.hidden = true;
    setStatus('Локальные персональные данные очищены.', 'info');
  });
})();
