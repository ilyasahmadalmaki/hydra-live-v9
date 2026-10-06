// HYDRALIVE V9 — client behavior
(function () {
  'use strict';

  // Jam live di topbar
  var clock = document.getElementById('hzClock');
  function tick() {
    if (clock) clock.textContent = new Date().toLocaleTimeString('en-GB');
  }
  tick();
  setInterval(tick, 1000);

  // Channel switcher
  var chSel = document.getElementById('hzChSel');
  var chForm = document.getElementById('hzChForm');
  if (chSel && chForm) {
    chSel.addEventListener('change', function () {
      chForm.action = '/channels/' + chSel.value + '/activate';
      chForm.submit();
    });
  }

  // Polling status sistem
  var cpuEl = document.getElementById('hzCpu');
  var cpuBar = document.getElementById('hzCpuBar');
  var memEl = document.getElementById('hzMem');
  var memBar = document.getElementById('hzMemBar');
  var upEl = document.getElementById('hzUptime');

  function fmtUptime(sec) {
    var d = Math.floor(sec / 86400);
    var h = Math.floor((sec % 86400) / 3600);
    var m = Math.floor((sec % 3600) / 60);
    return d + 'd ' + String(h).padStart(2, '0') + 'h ' + String(m).padStart(2, '0') + 'm';
  }

  function poll() {
    fetch('/api/status')
      .then(function (r) { return r.json(); })
      .then(function (s) {
        var cpuPct = Math.min(100, Math.round(parseFloat(s.load1) / s.cpuCount * 100));
        if (cpuEl) cpuEl.textContent = 'load ' + s.load1 + ' (' + cpuPct + '%)';
        if (cpuBar) cpuBar.style.width = cpuPct + '%';
        if (memEl) memEl.textContent = s.memUsedGb.toFixed(1) + ' / ' + s.memTotalGb.toFixed(1) + ' GB';
        if (memBar) memBar.style.width = s.memUsedPct + '%';
        if (upEl) upEl.textContent = fmtUptime(s.uptime);
      })
      .catch(function () { /* diam saat offline */ });
  }
  poll();
  setInterval(poll, 5000);

  // Tombol DEPLOY / STOP broadcast
  function bindBtns(attr, url, confirmMsg) {
    document.querySelectorAll('[' + attr + ']').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirmMsg && !confirm(confirmMsg)) return;
        btn.disabled = true;
        btn.textContent = '…';
        fetch(url + btn.getAttribute(attr) + (attr === 'data-start' ? '/start' : '/stop'), { method: 'POST' })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (!res.ok) alert('Gagal: ' + (res.error || 'unknown'));
            location.reload();
          })
          .catch(function () { location.reload(); });
      });
    });
  }
  bindBtns('data-start', '/api/broadcasts/', null);
  bindBtns('data-stop', '/api/broadcasts/', 'Stop broadcast ini?');

  // Terminal: tampilkan log FFmpeg dari broadcast yang live
  var term = document.getElementById('hzTerm');
  var liveId = term ? term.getAttribute('data-live') : null;

  function renderLogs(lines) {
    if (!term) return;
    term.innerHTML = '';
    lines.slice(-12).forEach(function (l) {
      var div = document.createElement('div');
      var esc = l.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      if (/error|failed/i.test(l)) div.innerHTML = '<span class="err">' + esc + '</span>';
      else if (/^\[/.test(l)) div.innerHTML = '<span class="cy">' + esc + '</span>';
      else if (l.indexOf('$') === 0) div.innerHTML = '<span class="p">' + esc + '</span>';
      else div.textContent = l;
      term.appendChild(div);
    });
    var prompt = document.createElement('div');
    prompt.innerHTML = '<span class="p">$</span> <span class="hz-cursor"></span>';
    term.appendChild(prompt);
    term.scrollTop = term.scrollHeight;
  }

  if (term && liveId) {
    (function pollLogs() {
      fetch('/api/broadcasts/' + liveId + '/logs')
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.logs && d.logs.length) renderLogs(d.logs); })
        .catch(function () {});
      setTimeout(pollLogs, 5000);
    })();
  } else if (term) {
    // feed simulasi saat tidak ada yang live
    var feed = [
      '<span class="cy">[net]</span> heartbeat ok <span class="dim">latency 38ms</span>',
      '<span class="cy">[ok]</span> vault scan complete <span class="dim">0 new media</span>',
      '<span class="p">$</span> hydra watch --all <span class="dim"># monitoring…</span>',
      '<span class="warn">[warn]</span> jitter spike 164ms <span class="dim">— auto-compensated</span>'
    ];
    var fi = 0;
    setInterval(function () {
      var prompt = term.lastElementChild;
      var line = document.createElement('div');
      line.innerHTML = feed[fi % feed.length];
      term.insertBefore(line, prompt);
      fi++;
      while (term.children.length > 12) term.removeChild(term.firstElementChild);
    }, 7000);
  }
})();
