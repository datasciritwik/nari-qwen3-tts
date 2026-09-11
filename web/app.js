/**
 * Nari Qwen3-TTS — Voice Studio Application Logic
 * High-performance, responsive UI controller with Web Audio visualizer
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Header & Status Elements ---
  const systemStatusPill = document.getElementById('system-status-pill');
  const statusText = document.getElementById('status-text');

  // --- Voice Selection & Filter Elements ---
  const voiceChips = document.querySelectorAll('.voice-chip');
  const tabBtns = document.querySelectorAll('.tab-btn');

  // --- Editor & Controls Elements ---
  const speechInput = document.getElementById('speech-input');
  const charCount = document.getElementById('char-count');
  const estDuration = document.getElementById('est-duration');
  const languageSelect = document.getElementById('language-select');
  const markdownToggle = document.getElementById('markdown-cleaner-toggle');
  const clearBtn = document.getElementById('clear-btn');
  const synthesizeBtn = document.getElementById('synthesize-btn');
  const btnSpinner = document.getElementById('btn-spinner');
  const btnIcon = document.getElementById('btn-icon');
  const btnLabel = document.getElementById('btn-label');

  // --- Presets ---
  const presetBlog = document.getElementById('preset-blog');
  const presetTech = document.getElementById('preset-tech');
  const presetGreeting = document.getElementById('preset-greeting');

  // --- Audio Player Elements ---
  const deckMetaInfo = document.getElementById('deck-meta-info');
  const nativeAudio = document.getElementById('native-audio');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const seekSlider = document.getElementById('seek-slider');
  const currentTimeEl = document.getElementById('current-time');
  const totalDurationEl = document.getElementById('total-duration');
  const volumeSlider = document.getElementById('volume-slider');
  const muteBtn = document.getElementById('mute-btn');
  const downloadAudioBtn = document.getElementById('download-audio-btn');
  const speedChips = document.querySelectorAll('.speed-chip');
  const visualizerIdleNotice = document.getElementById('visualizer-idle-notice');
  const waveformCanvas = document.getElementById('waveform-canvas');
  const canvasCtx = waveformCanvas.getContext('2d');

  // --- History Elements ---
  const historyCount = document.getElementById('history-count');
  const historyChipsRow = document.getElementById('history-chips-row');
  const historyEmpty = document.getElementById('history-empty');

  // --- Application State ---
  let selectedVoice = 'ryan';
  let isGenerating = false;
  let historyItems = [];
  let audioContext = null;
  let analyser = null;
  let audioSource = null;
  let visualizerAnimId = null;
  let idleAnimPhase = 0;
  let currentSpeed = 1.0;

  // --- Preset Texts ---
  const PRESETS = {
    blog: `One call to the cheap model, with the three defences its quirks require.

The function ask, taking prompt, schema equals None, model equals FLASH, returning Answer.

agy, the Antigravity CLI on the Google AI Pro subscription, is the generation half of this project: it writes content, and the engine — which has no judgment by design — renders it. Claude is not in this path; it is for introspection and debugging, which is the whole point of the split.

Three things about agy are load-bearing and were each found by it going wrong, so none of them may be quietly removed:

1. It is an AGENT, not a completion endpoint. Left alone it tries to run shell commands, gets denied, and spends its only turn doing it — returning an EMPTY response with status SUCCESS. NO_TOOLS is prepended to every prompt.

2. json-schema is not enforcement; it is implemented as a tool call. The response is prose that may contain SEVERAL concatenated JSON objects — a draft, then the tool payloads — and the payloads carry toolAction and toolSummary keys that are in nobody's schema. objects() pulls them all out and ask keeps the last one that actually validates.

3. It "repairs" a schema violation by mutilating the content. Asked for three items it drafted four, then dropped one AND changed initialCapacity 4 to 3 so the array lab lost the free slot it exists to show. Schema-valid, wrong. Hence check equals: a caller passes the semantic rule the schema cannot state, and a violation is a raised error, not a warning nobody reads.`,
    tech: `Welcome to Nari Qwen3-TTS, running high-performance neural voice synthesis locally on Apple Silicon. This serving engine delivers ultra-low latency audio generation with expressive custom voices.`,
    greeting: `Hello! This is Qwen3 TTS running smoothly on Apple Silicon.`
  };

  // Set initial text
  speechInput.value = PRESETS.greeting;
  updateStats();

  // Resize waveform canvas to match container width
  function resizeCanvas() {
    if (waveformCanvas.parentElement) {
      waveformCanvas.width = waveformCanvas.parentElement.clientWidth;
      waveformCanvas.height = waveformCanvas.parentElement.clientHeight || 64;
    }
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // =========================================================================
  // 1. Backend Server Health Monitor
  // =========================================================================
  async function checkBackendHealth() {
    const healthUrl = window.location.port === '8000' ? '/health' : 'http://127.0.0.1:8000/health';
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.alive) {
          systemStatusPill.classList.remove('error');
          statusText.textContent = 'Engine Online';
          return true;
        }
      }
      throw new Error('Offline');
    } catch {
      systemStatusPill.classList.add('error');
      statusText.textContent = 'Engine Offline';
      return false;
    }
  }
  checkBackendHealth();
  setInterval(checkBackendHealth, 10000);

  // =========================================================================
  // 2. Voice Selection & Gender Filter Tabs
  // =========================================================================
  voiceChips.forEach(chip => {
    chip.addEventListener('click', () => {
      voiceChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedVoice = chip.getAttribute('data-voice');
    });
  });

  tabBtns.forEach(tab => {
    tab.addEventListener('click', () => {
      tabBtns.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const filter = tab.getAttribute('data-filter');

      voiceChips.forEach(chip => {
        const gender = chip.getAttribute('data-gender');
        if (filter === 'all' || gender === filter) {
          chip.style.display = 'flex';
        } else {
          chip.style.display = 'none';
        }
      });
    });
  });

  // =========================================================================
  // 3. Preset Buttons
  // =========================================================================
  presetBlog.addEventListener('click', () => {
    speechInput.value = PRESETS.blog;
    updateStats();
    speechInput.focus();
  });
  presetTech.addEventListener('click', () => {
    speechInput.value = PRESETS.tech;
    updateStats();
    speechInput.focus();
  });
  presetGreeting.addEventListener('click', () => {
    speechInput.value = PRESETS.greeting;
    updateStats();
    speechInput.focus();
  });

  // =========================================================================
  // 4. Character & Duration Estimator
  // =========================================================================
  function updateStats() {
    const len = speechInput.value.length;
    charCount.textContent = `${len} character${len === 1 ? '' : 's'}`;
    // Average speech speaking rate ~14 characters per second
    const estSec = Math.max(1, Math.round(len / 14));
    estDuration.textContent = `~${estSec}s audio`;
  }
  speechInput.addEventListener('input', updateStats);

  clearBtn.addEventListener('click', () => {
    speechInput.value = '';
    updateStats();
    speechInput.focus();
  });

  // Keyboard shortcut: Cmd/Ctrl + Enter to synthesize
  speechInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      synthesizeBtn.click();
    }
  });

  // =========================================================================
  // 5. Smart Markdown Normalization
  // =========================================================================
  function cleanMarkdown(text) {
    return text
      .replace(/^(#+)\s*/gm, '')             // strip markdown heading hashes (# Heading)
      .replace(/`([^`]+)`/g, '$1')            // strip backticks (`code` -> code)
      .replace(/->/g, 'to')                   // convert arrows -> to 'to'
      .replace(/--([a-zA-Z0-9_-]+)/g, '$1')   // strip CLI flag dashes (--flag -> flag)
      .replace(/([a-zA-Z0-9_]+)\//g, '$1')    // strip trailing slashes (engine/ -> engine)
      .trim();
  }

  // =========================================================================
  // 6. Speech Generation Action
  // =========================================================================
  synthesizeBtn.addEventListener('click', async () => {
    const rawText = speechInput.value.trim();
    if (!rawText || isGenerating) return;

    const finalText = markdownToggle.checked ? cleanMarkdown(rawText) : rawText;

    isGenerating = true;
    synthesizeBtn.disabled = true;
    btnSpinner.classList.remove('hidden');
    btnIcon.classList.add('hidden');
    btnLabel.textContent = 'Synthesizing...';
    deckMetaInfo.textContent = `Synthesizing with voice "${capitalize(selectedVoice)}" on Apple Silicon...`;

    const startTime = performance.now();

    try {
      const endpoint = window.location.port === '8000' ? '/v1/audio/speech' : 'http://127.0.0.1:8000/v1/audio/speech';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice',
          input: finalText,
          voice: selectedVoice,
          language: languageSelect.value,
          response_format: 'wav',
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
      const audioUrl = URL.createObjectURL(blob);

      loadAudio(audioUrl, {
        text: rawText,
        voice: selectedVoice,
        lang: languageSelect.value,
        sizeKb: (blob.size / 1024).toFixed(1),
        genTime: elapsedSec
      });

      addToHistory({
        url: audioUrl,
        text: rawText,
        voice: selectedVoice,
        timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

    } catch (err) {
      console.error(err);
      deckMetaInfo.textContent = `Error: ${err.message}`;
      alert(`Synthesis Failed: ${err.message}\nMake sure the local server is running on http://127.0.0.1:8000`);
    } finally {
      isGenerating = false;
      synthesizeBtn.disabled = false;
      btnSpinner.classList.add('hidden');
      btnIcon.classList.remove('hidden');
      btnLabel.textContent = 'Generate Speech';
    }
  });

  // =========================================================================
  // 7. Audio Player Management
  // =========================================================================
  function loadAudio(url, meta) {
    nativeAudio.src = url;
    nativeAudio.playbackRate = currentSpeed;

    downloadAudioBtn.href = url;
    downloadAudioBtn.classList.remove('disabled');
    downloadAudioBtn.download = `qwen3_${meta.voice}_${Date.now()}.wav`;

    deckMetaInfo.textContent = `Voice: ${capitalize(meta.voice)} • ${meta.sizeKb} KB • Generated in ${meta.genTime}s`;
    visualizerIdleNotice.classList.add('hidden');

    playPauseBtn.disabled = false;
    seekSlider.disabled = false;

    nativeAudio.onloadedmetadata = () => {
      totalDurationEl.textContent = formatTime(nativeAudio.duration);
    };

    playAudio();
  }

  function playAudio() {
    initAudioContext();
    nativeAudio.play().then(() => {
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
      visualizerIdleNotice.classList.add('hidden');
    }).catch(e => console.log('Autoplay prevented:', e));
  }

  function pauseAudio() {
    nativeAudio.pause();
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }

  playPauseBtn.addEventListener('click', () => {
    if (nativeAudio.paused) {
      playAudio();
    } else {
      pauseAudio();
    }
  });

  nativeAudio.addEventListener('timeupdate', () => {
    if (!isNaN(nativeAudio.duration) && nativeAudio.duration > 0) {
      const pct = (nativeAudio.currentTime / nativeAudio.duration) * 100;
      seekSlider.value = pct;
      currentTimeEl.textContent = formatTime(nativeAudio.currentTime);
    }
  });

  nativeAudio.addEventListener('ended', () => {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    seekSlider.value = 0;
    currentTimeEl.textContent = '0:00';
  });

  seekSlider.addEventListener('input', () => {
    if (!isNaN(nativeAudio.duration)) {
      nativeAudio.currentTime = (seekSlider.value / 100) * nativeAudio.duration;
    }
  });

  // Speed chips
  speedChips.forEach(chip => {
    chip.addEventListener('click', () => {
      speedChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentSpeed = parseFloat(chip.getAttribute('data-speed')) || 1.0;
      nativeAudio.playbackRate = currentSpeed;
    });
  });

  // Volume & Mute
  volumeSlider.addEventListener('input', () => {
    nativeAudio.volume = volumeSlider.value;
    nativeAudio.muted = (volumeSlider.value === '0');
  });

  muteBtn.addEventListener('click', () => {
    nativeAudio.muted = !nativeAudio.muted;
    if (nativeAudio.muted) {
      volumeSlider.value = 0;
    } else {
      volumeSlider.value = nativeAudio.volume || 1;
    }
  });

  // =========================================================================
  // 8. Waveform Visualizer (Ambient & Reactive)
  // =========================================================================
  function initAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      audioSource = audioContext.createMediaElementSource(nativeAudio);
      audioSource.connect(analyser);
      analyser.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }

  function renderVisualizerLoop() {
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;

    canvasCtx.clearRect(0, 0, width, height);

    if (analyser && !nativeAudio.paused) {
      // Active playing: FFT spectrum bars
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const barWidth = (width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = Math.max(3, (dataArray[i] / 255) * height * 0.9);

        const gradient = canvasCtx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(0.5, '#8b5cf6');
        gradient.addColorStop(1, '#ec4899');

        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, height - barHeight, barWidth - 1.5, barHeight);

        x += barWidth;
      }
    } else {
      // Idle ambient wave: sleek rhythmic breathing curve
      idleAnimPhase += 0.03;
      canvasCtx.beginPath();
      canvasCtx.lineWidth = 1.5;

      const grad = canvasCtx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, 'rgba(99, 102, 241, 0.15)');
      grad.addColorStop(0.5, 'rgba(139, 92, 246, 0.35)');
      grad.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
      canvasCtx.strokeStyle = grad;

      const midY = height / 2;
      for (let x = 0; x < width; x += 4) {
        const y = midY + Math.sin(x * 0.02 + idleAnimPhase) * 6 * Math.sin(x * 0.005);
        if (x === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);
      }
      canvasCtx.stroke();
    }

    visualizerAnimId = requestAnimationFrame(renderVisualizerLoop);
  }
  renderVisualizerLoop();

  // =========================================================================
  // 9. History Management
  // =========================================================================
  function addToHistory(item) {
    historyItems.unshift(item);
    if (historyItems.length > 6) historyItems.pop();
    renderHistory();
  }

  function renderHistory() {
    if (historyItems.length === 0) {
      historyEmpty.classList.remove('hidden');
      historyCount.textContent = '0 items';
      return;
    }

    historyEmpty.classList.add('hidden');
    historyCount.textContent = `${historyItems.length} items`;
    historyChipsRow.innerHTML = '';

    historyItems.forEach((item) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'history-clip-item';
      chip.title = `Click to replay: "${item.text.replace(/"/g, '&quot;')}"`;
      chip.innerHTML = `
        <span class="history-clip-voice">${capitalize(item.voice)}</span>
        <span class="history-clip-text">${escapeHtml(item.text.slice(0, 32))}${item.text.length > 32 ? '...' : ''}</span>
      `;

      chip.addEventListener('click', () => {
        loadAudio(item.url, {
          text: item.text,
          voice: item.voice,
          sizeKb: '-',
          genTime: '-'
        });
      });

      historyChipsRow.appendChild(chip);
    });
  }

  // --- Helpers ---
  function formatTime(sec) {
    if (isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }
});
