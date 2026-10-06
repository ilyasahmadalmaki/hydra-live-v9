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

  // Terminal feed — simulasi log sistem
  var term = document.getElementById('hzTerm');
  var feed = [
    '<span class="cy">[net]</span> heartbeat ok <span class="dim">latency 38ms</span>',
    '<span class="cy">[ok]</span> vault scan complete <span class="dim">0 new media</span>',
    '<span class="p">$</span> hydra watch --all <span class="dim"># monitoring…</span>',
    '<span class="warn">[warn]</span> jitter spike 164ms <span class="dim">— auto-compensated</span>',
    '<span class="cy">[ok]</span> scheduler tick <span class="dim">no due jobs</span>'
  ];
  var fi = 0;
  if (term) {
    setInterval(function () {
      var cursor = term.querySelector('.hz-cursor');
      var line = document.createElement('div');
      // sisipkan sebelum baris prompt terakhir
      var prompt = term.lastElementChild;
      line.innerHTML = feed[fi % feed.length];
      term.insertBefore(line, prompt);
      fi++;
      while (term.children.length > 14) term.removeChild(term.firstElementChild);
      term.scrollTop = term.scrollHeight;
    }, 6000);
  }
})();
