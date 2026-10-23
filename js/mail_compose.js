'use strict';
// Soạn / Trả lời / Chuyển tiếp thư trên AwD & AwM. Thư được xếp hàng trên máy chủ,
// AD (đang mở) lấy về và gửi bằng Outlook của chính người dùng.
window.MailCompose = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MAX_FILE = 3 * 1024 * 1024;
  let styleDone = false;

  function css() {
    if (styleDone) return; styleDone = true;
    const st = document.createElement('style');
    st.textContent = `
.mc-back{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-end;justify-content:center}
@media(min-width:760px){.mc-back{align-items:center}}
.mc{background:#fff;color:#111;color-scheme:light;width:100%;max-width:720px;max-height:96vh;overflow:auto;border-radius:16px 16px 0 0;padding:14px 16px 18px;font:14px/1.45 system-ui,Segoe UI,Arial;box-sizing:border-box}
@media(min-width:760px){.mc{border-radius:14px}}
.mc h3{margin:0 0 8px;font-size:16px;display:flex;justify-content:space-between;align-items:center}
.mc .x{border:0;background:none;font-size:22px;cursor:pointer;color:#556}
.mc .row{display:flex;align-items:flex-start;gap:8px;border:1.5px solid #b9c6bf;background:#f5f8f6;border-radius:12px;padding:6px 10px;margin:8px 0;position:relative}
.mc .row:focus-within{border-color:#1d6b55;background:#fff;box-shadow:0 0 0 3px rgba(29,107,85,.15)}
.mc .row>label{width:56px;flex:none;padding-top:8px;font-weight:700;color:#1d2f2c;font-size:14px}
.mc .chips{flex:1;display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-width:0}
.mc .chip{background:#e7efe9;border-radius:12px;padding:2px 8px;font-size:12px;display:inline-flex;gap:4px;align-items:center;max-width:100%}
.mc .chip b{cursor:pointer;color:#a33}
.mc .chips input,.mc .subj{flex:1;min-width:120px;border:0;outline:0;padding:8px 2px;font-size:16px;background:transparent;color:#111}
.mc .chips input::placeholder,.mc textarea::placeholder{color:#8a948f}
.mc .sug{position:absolute;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid #cfd8d2;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.15);z-index:3;max-height:220px;overflow:auto}
.mc .sug div{padding:10px 12px;cursor:pointer;font-size:15px;color:#111;border-bottom:1px solid #eef1ef}.mc .sug div:hover,.mc .sug .on{background:#eef4f0}
.mc .sug small{color:#778;display:block}
.mc textarea{width:100%;min-height:170px;font-size:16px!important;border:1.5px solid #b9c6bf;background:#f5f8f6;border-radius:10px;padding:10px;margin-top:10px;font:inherit;box-sizing:border-box;color:inherit;background:#fff}
.mc .files{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}
.mc .bar{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
.mc .send{background:#1d2f2c;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-weight:700;cursor:pointer}
.mc .send:disabled{opacity:.5}
.mc .att{border:1px solid #c9d3cf;border-radius:10px;padding:9px 12px;background:#fff;cursor:pointer;color:inherit}
.mc .msg{font-size:12px;color:#a33;flex-basis:100%}
.mc .ok{color:#107c41}
.mc .ccbtn{border:0;background:none;color:#1a73e8;cursor:pointer;font-size:12px;padding:6px 0}
.mc .quote{margin-top:8px;font-size:12px;color:#667;border-left:3px solid #d6dbd5;padding-left:8px;max-height:120px;overflow:auto;white-space:pre-wrap}`;
    document.head.appendChild(st);
  }

  const addrOf = p => (p && (p.email || '')).trim();
  const label = p => p.name && p.name !== p.email ? `${p.name} <${p.email}>` : p.email;

  function recipientField(root, key, rpc, initial) {
    const row = root.querySelector(`[data-field="${key}"]`);
    const box = row.querySelector('.chips'), input = box.querySelector('input'), sug = row.querySelector('.sug');
    const list = [];
    let timer = 0, hits = [], pos = -1;
    const draw = () => {
      box.querySelectorAll('.chip').forEach(c => c.remove());
      list.forEach((p, i) => {
        const c = document.createElement('span'); c.className = 'chip';
        c.innerHTML = `${esc(label(p))}<b title="Bỏ">×</b>`;
        c.querySelector('b').onclick = () => { list.splice(i, 1); draw(); };
        box.insertBefore(c, input);
      });
    };
    const add = p => { const em = addrOf(p); if (em && !list.some(x => x.email.toLowerCase() === em.toLowerCase())) list.push({name: p.name || em, email: em}); input.value = ''; sug.hidden = true; draw(); };
    const commitTyped = () => {
      const v = input.value.trim().replace(/[;,]$/, '');
      if (!v) return;
      const m = v.match(/<([^>]+)>/); const em = (m ? m[1] : v).trim();
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) add({name: m ? v.replace(/<.*>/, '').trim() : em, email: em});
    };
    const showHits = () => {
      sug.innerHTML = hits.map((h, i) => `<div data-i="${i}" class="${i === pos ? 'on' : ''}">${esc(h.name || h.email)}<small>${esc(h.email)}</small></div>`).join('');
      sug.hidden = !hits.length;
      sug.querySelectorAll('[data-i]').forEach(d => { const pick = e => { e.preventDefault(); add(hits[Number(d.dataset.i)]); input.focus(); }; d.onmousedown = pick; d.ontouchstart = pick; });
    };
    const lookup = () => {
      clearTimeout(timer);
      const q = input.value.trim();
      timer = setTimeout(async () => {
        try {
          const r = await rpc('awm_mail_contacts', [q]);
          const taken = new Set(list.map(p => p.email.toLowerCase()));
          hits = ((r && r.items) || []).filter(h => !taken.has(String(h.email).toLowerCase())).slice(0, 8);
          pos = hits.length ? 0 : -1; showHits();
        } catch (_) { hits = []; sug.hidden = true; }
      }, 150);
    };
    input.addEventListener('input', () => { if (/[;,]$/.test(input.value)) { commitTyped(); return; } lookup(); });
    input.addEventListener('compositionend', lookup);
    input.addEventListener('focus', lookup);
    input.addEventListener('keydown', e => {
      if (!sug.hidden && hits.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); pos = (pos + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; showHits(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (!sug.hidden && hits[pos]) { e.preventDefault(); add(hits[pos]); return; }
        if (input.value.trim()) { e.preventDefault(); commitTyped(); }
      }
      if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); draw(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { commitTyped(); sug.hidden = true; }, 150));
    box.onclick = () => input.focus();
    (initial || []).forEach(add);
    return { values: () => { commitTyped(); return list.map(p => p.email); } };
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('Không đọc được tệp ' + file.name));
      r.readAsDataURL(file);
    });
  }

  // opts: {rpc(method,argsArray)->Promise<data>, kind:'reply'|'reply_all'|'forward'|'new', message, project, me}
  function open(opts) {
    css();
    const {rpc, kind = 'new', message = null, project = ''} = opts;
    const me = String(opts.me || message?.account || '').toLowerCase();
    const title = {reply: 'Trả lời', reply_all: 'Trả lời tất cả', forward: 'Chuyển tiếp', new: 'Thư mới'}[kind] || 'Thư mới';
    const sentFolder = message && message.folder === 'Sent Items';
    let to = [], cc = [];
    if (message && kind !== 'forward' && kind !== 'new') {
      const sender = {name: message.sender, email: message.email || ''};
      to = sentFolder ? (message.to || []) : (sender.email ? [sender] : []);
      if (kind === 'reply_all') {
        const others = [...(sentFolder ? [] : message.to || []), ...(message.cc || [])].filter(p => p.email && p.email.toLowerCase() !== me && !to.some(t => t.email.toLowerCase() === p.email.toLowerCase()));
        cc = others;
      }
    }
    const pre = {reply: 'RE: ', reply_all: 'RE: ', forward: 'FW: '}[kind] || '';
    const subj = message ? (/^(re|fw|fwd)\s*:/i.test(message.subject || '') && kind !== 'forward' ? message.subject : pre + (message.subject || '')) : '';
    const back = document.createElement('div'); back.className = 'mc-back';
    back.innerHTML = `<div class="mc" role="dialog" aria-label="${title}">
<h3><span>✉️ ${title}${message?.account ? ` <small style="font-weight:400;color:#778;font-size:12px">từ ${esc(message.account)}</small>` : ''}</span><button class="x" title="Đóng">×</button></h3>
<div class="row" data-field="to"><label>Đến</label><div class="chips"><input autocomplete="off" placeholder="Gõ tên hoặc email…"></div><div class="sug" hidden></div></div>
<button class="ccbtn" type="button">+ CC / BCC</button>
<div class="row" data-field="cc" hidden><label>CC</label><div class="chips"><input autocomplete="off"></div><div class="sug" hidden></div></div>
<div class="row" data-field="bcc" hidden><label>BCC</label><div class="chips"><input autocomplete="off"></div><div class="sug" hidden></div></div>
<div class="row"><label>Tiêu đề</label><input class="subj" value="${esc(subj)}" placeholder="Tiêu đề thư"></div>
<textarea placeholder="Nội dung thư…"></textarea>
${message && kind !== 'new' ? `<div class="quote">Thư gốc từ ${esc(message.sender)} (${esc(message.date)}) sẽ được trích dẫn bên dưới${kind === 'forward' && message.attachments?.length ? ', kèm ' + message.attachments.length + ' tệp gốc' : ''}.\n\n${esc(String(message.body || '').slice(0, 600))}</div>` : ''}
<div class="files"></div>
<div class="bar"><button class="send" type="button">Gửi</button><label class="att">📎 Đính kèm<input type="file" multiple hidden></label><span class="msg" role="status"></span></div>
</div>`;
    document.body.appendChild(back);
    const root = back.querySelector('.mc');
    const close = () => back.remove();
    root.querySelector('.x').onclick = close;
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    const fTo = recipientField(root, 'to', rpc, to), fCc = recipientField(root, 'cc', rpc, cc), fBcc = recipientField(root, 'bcc', rpc, []);
    const showCc = () => { root.querySelector('[data-field="cc"]').hidden = false; root.querySelector('[data-field="bcc"]').hidden = false; root.querySelector('.ccbtn').hidden = true; };
    root.querySelector('.ccbtn').onclick = showCc; if (cc.length) showCc();
    const msg = root.querySelector('.msg'), filesBox = root.querySelector('.files'), sendBtn = root.querySelector('.send');
    const say = (t, ok) => { msg.textContent = t; msg.className = 'msg' + (ok ? ' ok' : ''); };
    const uploads = []; // {id,name,size} | {pending:true}
    const drawFiles = () => {
      filesBox.innerHTML = uploads.map((u, i) => `<span class="chip">${u.pending ? '⏳' : '📎'} ${esc(u.name)} <small>${Math.max(1, Math.round((u.size || 0) / 1024))} KB</small>${u.pending ? '' : `<b data-rm="${i}">×</b>`}</span>`).join('');
      filesBox.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { uploads.splice(Number(b.dataset.rm), 1); drawFiles(); });
    };
    root.querySelector('input[type=file]').onchange = async e => {
      for (const file of [...e.target.files]) {
        if (file.size > MAX_FILE) { say(`"${file.name}" lớn hơn 3 MB, không gửi được từ web.`); continue; }
        const slot = {pending: true, name: file.name, size: file.size}; uploads.push(slot); drawFiles();
        try { const data = await readFile(file); const r = await rpc('awm_mail_attach', [file.name, file.type || 'application/octet-stream', data]); Object.assign(slot, {pending: false, id: r.id}); }
        catch (err) { uploads.splice(uploads.indexOf(slot), 1); say(err.message || String(err)); }
        drawFiles();
      }
      e.target.value = '';
    };
    root.querySelector('textarea').focus();
    sendBtn.onclick = async () => {
      if (uploads.some(u => u.pending)) { say('Đang tải tệp đính kèm, chờ chút…'); return; }
      const payload = {kind, source_id: message?.id || '', account: message?.account || '', project,
        to: fTo.values(), cc: fCc.values(), bcc: fBcc.values(),
        subject: root.querySelector('.subj').value, body: root.querySelector('textarea').value,
        attachments: uploads.map(u => u.id)};
      if (!payload.to.length) { say('Cần ít nhất một người nhận.'); return; }
      sendBtn.disabled = true; say('Đang chuyển cho AD gửi…', true);
      try {
        const r = await rpc('awm_mail_send', [payload]);
        say('Đã xếp hàng. AD sẽ gửi bằng Outlook trong khoảng 20 giây…', true);
        for (let i = 0; i < 20; i++) {
          await new Promise(res => setTimeout(res, 3000));
          const ob = await rpc('awm_mail_outbox', []).catch(() => null);
          const job = ob?.items?.find(j => j.id === r.id);
          if (job?.status === 'sent') { say('✅ Đã gửi thành công từ Outlook.', true); setTimeout(close, 1200); return; }
          if (job?.status === 'error') { say('Gửi lỗi: ' + job.error); sendBtn.disabled = false; return; }
        }
        say('AD chưa xác nhận. Thư vẫn trong hàng chờ, sẽ gửi khi AD phản hồi.', true);
      } catch (err) { say(err.message || String(err)); sendBtn.disabled = false; }
    };
  }

  return {open};
})();
