(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function eur(n) { return n.toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €'; }
  function hhmm() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function dmy(d) { return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---------- Año, menú móvil, pestañas ---------- */
  var y = $('#year'); if (y) y.textContent = new Date().getFullYear();
  var tg = $('#navToggle'), pn = $('#mobilePanel');
  if (tg && pn) {
    tg.addEventListener('click', function () {
      var o = pn.classList.toggle('open');
      tg.setAttribute('aria-expanded', String(o));
      tg.setAttribute('aria-label', o ? 'Cerrar menú' : 'Abrir menú');
    });
  }
  $$('.tabs').forEach(function (tabs) {
    var btns = $$('button[role=tab]', tabs);
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) {
          var on = x === b;
          x.setAttribute('aria-selected', String(on));
          var p = document.getElementById(x.getAttribute('data-target'));
          if (p) p.hidden = !on;
        });
      });
    });
  });

  /* ---------- Precios: mensual / anual (-20 %) ---------- */
  var bills = $$('[data-billing]');
  if (bills.length) {
    var setBilling = function (mode) {
      bills.forEach(function (b) { var on = b.getAttribute('data-billing') === mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      $$('.plan').forEach(function (pl) {
        var m = parseFloat(pl.getAttribute('data-monthly'));
        var p = mode === 'anual' ? m * 0.8 : m;
        var num = $('.price-num', pl), note = $('.price-note', pl);
        if (num) num.textContent = mode === 'anual' ? p.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : p.toLocaleString('es-ES') + ' €';
        if (note) note.textContent = mode === 'anual' ? 'Facturado anualmente: ' + (p * 12).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' € al año (−20 %).' : 'Facturado mensualmente. Sin permanencia.';
      });
    };
    bills.forEach(function (b) { b.addEventListener('click', function () { setBilling(b.getAttribute('data-billing')); }); });
    setBilling('mensual');
  }

  /* ---------- Formulario de prueba gratuita (API del CRM) ---------- */
  var LEAD_API_URL = 'https://omnitech-core-api.onrender.com/api/leads-public/diagnostico';
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function coldStart(res) {
    if ([404, 502, 503, 504].indexOf(res.status) === -1) return false;
    return (res.headers.get('content-type') || '').indexOf('application/json') === -1;
  }
  async function fetchRetry(url, opts) {
    var delays = [4000, 8000];
    for (var i = 0; i <= delays.length; i++) {
      try {
        var res = await fetch(url, opts);
        if (i < delays.length && coldStart(res)) { await sleep(delays[i]); continue; }
        return res;
      } catch (e) { if (i < delays.length) { await sleep(delays[i]); continue; } throw e; }
    }
  }
  var form = $('#trialForm');
  if (form) {
    var ok = $('#trialOk'), err = $('#trialErr'), btn = $('button[type=submit]', form), btnHtml = btn.innerHTML;
    var map = { facturacion: 'Facturación y cobros', inspecciones: 'Inspecciones y docs', todo: 'Todo integrado' };
    try {
      var q = new URLSearchParams(location.search).get('quiero');
      if (q && map[q]) $('#tf-quiero').value = map[q];
    } catch (e) { /* no-op */ }
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      ok.hidden = true; err.hidden = true;
      if (!form.checkValidity()) { err.textContent = 'Revisa los campos obligatorios antes de enviar.'; err.hidden = false; form.reportValidity(); return; }
      var fd = new FormData(form);
      var payload = {
        nombre: fd.get('nombre'), empresa: fd.get('empresa'), email: fd.get('email'),
        necesidad: 'Solicita prueba de 7 días; requiere revisión comercial manual. Quiere resolver primero: ' + fd.get('quiero') + '.'
      };
      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        var res = await fetchRetry(LEAD_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('request-failed');
        ok.innerHTML = '<strong>¡Listo, ' + esc(payload.nombre) + '!</strong> Hemos recibido tu solicitud. Revisaremos tu caso y te contactaremos en <strong>' + esc(payload.email) + '</strong> para activarla.';
        ok.hidden = false; ok.scrollIntoView({ block: 'center', behavior: 'smooth' });
        form.reset();
        if (q && map[q]) $('#tf-quiero').value = map[q];
      } catch (x) {
        err.innerHTML = 'No hemos podido enviar la solicitud. Inténtalo de nuevo en unos segundos o escríbenos por <a href="https://wa.me/34677966378">WhatsApp</a>.';
        err.hidden = false;
      } finally { btn.disabled = false; btn.innerHTML = btnHtml; }
    });
  }

  /* ---------- Simulador: facturas por cobrar y clientes potenciales ---------- */
  function initFact(root) {
    var inv, leads, log, sent;
    function reset() {
      inv = [
        { id: 1, cliente: 'Reformas Alba S.L.', importe: 1250, dias: -12, rec: null },
        { id: 2, cliente: 'Clínica Dental Sol', importe: 480, dias: 5, rec: null },
        { id: 3, cliente: 'Academia Norte', importe: 2100, dias: -30, rec: null }
      ];
      leads = [
        { id: 1, nombre: 'Taller Martín', importe: 3400, dias: 6, seg: false },
        { id: 2, nombre: 'Gimnasio Atlas', importe: 890, dias: 2, seg: false },
        { id: 3, nombre: 'Hotel Mirador', importe: 5200, dias: 9, seg: false }
      ];
      log = []; sent = 0; render();
    }
    function addLog(html) { log.unshift('<li><b>' + hhmm() + '</b> · ' + html + '</li>'); log = log.slice(0, 6); renderLog(); }
    function renderLog() {
      $('[data-log]', root).innerHTML = log.length ? log.join('') : '<li>Aún no hay actividad. Pulsa un botón de la demo.</li>';
    }
    function render() {
      var pend = inv.reduce(function (a, i) { return a + i.importe; }, 0);
      var venc = inv.filter(function (i) { return i.dias < 0; }).length;
      $('[data-kpis=inv]', root).innerHTML = '<div><strong>' + eur(pend) + '</strong>Pendiente de cobro</div><div><strong>' + venc + '</strong>Facturas vencidas</div><div><strong>' + sent + '</strong>Recordatorios enviados</div>';
      $('[data-list=inv]', root).innerHTML = inv.map(function (i) {
        var st = i.rec ? '<span class="st ok">Recordatorio enviado por email y WhatsApp · ' + i.rec + '</span>'
          : i.dias < 0 ? '<span class="st bad">Vencida hace ' + plural(-i.dias, 'día', 'días') + '</span>'
          : '<span class="st warn">Vence en ' + plural(i.dias, 'día', 'días') + '</span>';
        return '<li><div><b>' + esc(i.cliente) + '</b><span class="meta">' + eur(i.importe) + '</span>' + st + '</div>' +
          '<button class="btn btn-secondary btn-sm" data-act="remind" data-id="' + i.id + '"' + (i.rec ? ' disabled' : '') + '>' + (i.rec ? 'Recordatorio enviado' : 'Enviar recordatorio ahora') + '</button></li>';
      }).join('');
      var abiertos = leads.length, imp = leads.reduce(function (a, l) { return a + l.importe; }, 0);
      var act = leads.filter(function (l) { return l.seg; }).length;
      $('[data-kpis=leads]', root).innerHTML = '<div><strong>' + abiertos + '</strong>Presupuestos abiertos</div><div><strong>' + eur(imp) + '</strong>Importe en juego</div><div><strong>' + act + '</strong>Con seguimiento activo</div>';
      $('[data-list=leads]', root).innerHTML = leads.map(function (l) {
        var st = l.seg ? '<span class="st ok">Seguimiento automático activo · próximo aviso en 2 días</span>'
          : l.dias >= 5 ? '<span class="st warn">Presupuesto enviado hace ' + plural(l.dias, 'día', 'días') + ' · sin respuesta</span>'
          : l.dias === 0 ? '<span class="st neutral">Presupuesto enviado hoy</span>'
          : '<span class="st neutral">Presupuesto enviado hace ' + plural(l.dias, 'día', 'días') + '</span>';
        return '<li><div><b>' + esc(l.nombre) + '</b><span class="meta">' + eur(l.importe) + '</span>' + st + '</div>' +
          '<button class="btn btn-secondary btn-sm" data-act="follow" data-id="' + l.id + '"' + (l.seg ? ' disabled' : '') + '>' + (l.seg ? 'Seguimiento activo' : 'Activar seguimiento') + '</button></li>';
      }).join('');
      renderLog();
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var act = b.getAttribute('data-act'), id = +b.getAttribute('data-id');
      if (b.getAttribute('data-action') === 'reset') { reset(); return; }
      if (act === 'remind') {
        var i = inv.filter(function (x) { return x.id === id; })[0];
        if (i && !i.rec) { i.rec = hhmm(); sent++; addLog('Recordatorio de <b>' + eur(i.importe) + '</b> enviado a <b>' + esc(i.cliente) + '</b> por email y WhatsApp (simulado)'); render(); }
      } else if (act === 'follow') {
        var l = leads.filter(function (x) { return x.id === id; })[0];
        if (l && !l.seg) { l.seg = true; addLog('Seguimiento automático activado para <b>' + esc(l.nombre) + '</b> (simulado)'); render(); }
      }
    });
    $('[data-form=inv]', root).addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target;
      if (!f.checkValidity()) { f.reportValidity(); return; }
      var dias = parseInt(f.venc.value, 10);
      inv.unshift({ id: Date.now(), cliente: f.cliente.value.trim(), importe: parseFloat(f.importe.value), dias: dias, rec: null });
      addLog('Factura de prueba creada para <b>' + esc(f.cliente.value.trim()) + '</b>'); f.reset(); render();
    });
    $('[data-form=leads]', root).addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target;
      if (!f.checkValidity()) { f.reportValidity(); return; }
      leads.unshift({ id: Date.now(), nombre: f.nombre.value.trim(), importe: parseFloat(f.importe.value), dias: 0, seg: false });
      addLog('Cliente potencial de prueba añadido: <b>' + esc(f.nombre.value.trim()) + '</b>'); f.reset(); render();
    });
    reset();
  }

  /* ---------- Simulador: inspección de trabajo ---------- */
  function initInsp(root) {
    var DOCS = ['Contratos de trabajo', 'Altas en la Seguridad Social', 'Prevención de riesgos laborales (PRL)', 'Reconocimientos médicos', 'Registro horario', 'Seguros'];
    var DATA = {
      'Local Centro': [null, null, 210, 45, null, 160],
      'Obra Norte': [null, null, 12, -8, null, 95],
      'Oficina Central': [null, null, 300, 22, null, 25]
    };
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var all = [];
    Object.keys(DATA).forEach(function (c) { DATA[c].forEach(function (d, i) { all.push({ centro: c, doc: DOCS[i], dias: d }); }); });
    var centro = 'Todos', q = '', timer = null;
    function status(d) {
      if (d.dias === null) return { cls: 'ok', txt: 'Sin caducidad', csv: 'Sin caducidad' };
      var f = new Date(today.getTime() + d.dias * 86400000);
      if (d.dias < 0) return { cls: 'bad', txt: 'Caducado hace ' + plural(-d.dias, 'día', 'días'), csv: 'Caducado (' + dmy(f) + ')' };
      if (d.dias <= 30) return { cls: 'warn', txt: 'Caduca en ' + plural(d.dias, 'día', 'días') + ' (' + dmy(f) + ')', csv: 'Caduca ' + dmy(f) };
      return { cls: 'ok', txt: 'Vigente hasta ' + dmy(f), csv: 'Vigente hasta ' + dmy(f) };
    }
    function filtered() {
      return all.filter(function (d) {
        return (centro === 'Todos' || d.centro === centro) && (!q || (d.doc + ' ' + d.centro).toLowerCase().indexOf(q) !== -1);
      });
    }
    function render() {
      var list = filtered();
      var al = list.filter(function (d) { return d.dias !== null && d.dias <= 30; });
      $('[data-kpis]', root).innerHTML = '<div><strong>' + list.length + '</strong>Documentos</div><div><strong>' + al.length + '</strong>Alertas de caducidad</div>';
      $('[data-alerts]', root).innerHTML = al.length ? '<strong>Alertas automáticas</strong><ul>' + al.map(function (d) { return '<li>' + esc(d.centro) + ': ' + esc(d.doc) + ' — ' + status(d).txt.toLowerCase() + '</li>'; }).join('') + '</ul>' : '';
      $('[data-docs]', root).innerHTML = list.length ? list.map(function (d) {
        var s = status(d);
        return '<li><div><b>' + esc(d.doc) + '</b><span class="meta">' + esc(d.centro) + '</span></div><span class="st ' + s.cls + '">' + s.txt + '</span></li>';
      }).join('') : '<li>No hay documentos que coincidan con la búsqueda.</li>';
    }
    $$('[data-centros] button', root).forEach(function (b) {
      b.addEventListener('click', function () {
        centro = b.getAttribute('data-centro');
        $$('[data-centros] button', root).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        $('[data-live]', root).hidden = true; $('[data-exp]', root).hidden = true; render();
      });
    });
    $('[data-search]', root).addEventListener('input', function (e) { q = e.target.value.trim().toLowerCase(); render(); });
    $('[data-action=live]', root).addEventListener('click', function () {
      var list = filtered(); if (!list.length) return;
      var btn = this, live = $('[data-live]', root), i = 0, start = Date.now();
      btn.disabled = true; live.hidden = false; $('[data-exp]', root).hidden = true;
      live.innerHTML = '<p class="live-head"><strong data-t>0,0 s</strong> · Localizando documentación en ' + (centro === 'Todos' ? 'todos los centros' : esc(centro)) + '…</p><ul data-steps></ul><p class="live-done" hidden></p>';
      var tEl = $('[data-t]', live), ul = $('[data-steps]', live);
      clearInterval(timer);
      timer = setInterval(function () { tEl.textContent = ((Date.now() - start) / 1000).toFixed(1).replace('.', ',') + ' s'; }, 100);
      (function step() {
        if (i < list.length) {
          var li = document.createElement('li'); li.textContent = list[i].centro + ' · ' + list[i].doc; ul.appendChild(li); i++; setTimeout(step, 340);
        } else {
          clearInterval(timer);
          var secs = ((Date.now() - start) / 1000).toFixed(1).replace('.', ',');
          tEl.textContent = secs + ' s';
          var warn = list.filter(function (d) { return d.dias !== null && d.dias <= 30; }).length;
          var done = $('.live-done', live); done.hidden = false;
          done.textContent = 'Documentación entregada en ' + secs + ' s (simulación): ' + list.length + ' documentos localizados, ' + plural(warn, 'con alerta', 'con alerta') + '.';
          btn.disabled = false;
        }
      })();
    });
    $('[data-action=expediente]', root).addEventListener('click', function () {
      var list = filtered(); var exp = $('[data-exp]', root); $('[data-live]', root).hidden = true;
      if (!list.length) return;
      var title = centro === 'Todos' ? 'Todos los centros' : centro;
      exp.hidden = false;
      exp.innerHTML = '<h3>Expediente de inspección · ' + esc(title) + '</h3><p class="muted small">Generado el ' + dmy(new Date()) + ' a las ' + hhmm() + ' (simulación)</p>' +
        '<div class="exp-wrap"><table><thead><tr><th>Centro</th><th>Documento</th><th>Estado</th></tr></thead><tbody>' +
        list.map(function (d) { var s = status(d); return '<tr><td>' + esc(d.centro) + '</td><td>' + esc(d.doc) + '</td><td><span class="st ' + s.cls + '">' + s.txt + '</span></td></tr>'; }).join('') +
        '</tbody></table></div><button class="btn btn-secondary btn-sm" data-dl>Descargar CSV de ejemplo</button>';
      $('[data-dl]', exp).addEventListener('click', function () {
        var rows = [['Centro', 'Documento', 'Estado']].concat(list.map(function (d) { return [d.centro, d.doc, status(d).csv]; }));
        var csv = '\ufeff' + rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = 'expediente-ejemplo.csv'; document.body.appendChild(a); a.click(); a.remove();
      });
    });
    render();
  }
  $$('[data-sim=fact]').forEach(initFact);
  $$('[data-sim=insp]').forEach(initInsp);
})();
