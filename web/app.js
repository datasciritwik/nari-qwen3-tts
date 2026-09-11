/**
 * Nari Qwen3-TTS Frontend Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const backendStatusBadge = document.getElementById('backend-status-badge');
  const statusLabel = document.getElementById('status-label');
  const voiceCards = document.querySelectorAll('.voice-card');
  const selectedVoiceBadge = document.getElementById('selected-voice-badge');
  const languageSelect = document.getElementById('language-select');
  const markdownToggle = document.getElementById('markdown-cleaner-toggle');
  const speechInput = document.getElementById('speech-input');
  const charCount = document.getElementById('char-count');
  const clearBtn = document.getElementById('clear-btn');
  const synthesizeBtn = document.getElementById('synthesize-btn');
  const btnSpinner = document.getElementById('btn-spinner');
  const btnIcon = document.getElementById('btn-icon');
  const btnText = document.getElementById('btn-text');
  
  // Presets
  const sampleBtnBlog = document.getElementById('sample-btn-blog');
  const sampleBtnTech = document.getElementById('sample-btn-tech');
  const sampleBtnShort = document.getElementById('sample-btn-short');

  // Audio Player Elements
  const nativeAudio = document.getElementById('native-audio');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const seekSlider = document.getElementById('seek-slider');
  const currentTimeDisplay = document.getElementById('current-time');
  const totalDurationDisplay = document.getElementById('total-duration');
  const volumeSlider = document.getElementById('volume-slider');
  const downloadAudioBtn = document.getElementById('download-audio-btn');
  const playerMeta = document.getElementById('player-meta');
  const waveformPlaceholder = document.getElementById('waveform-placeholder');
  const waveformCanvas = document.getElementById('waveform-canvas');
  const canvasCtx = waveformCanvas.getContext('2d');

  // History Elements
  const historyList = document.getElementById('history-list');
  const historyCount = document.getElementById('history-count');
  const historyEmpty = document.getElementById('history-empty');

  // State
  let selectedVoice = 'ryan';
  let isGenerating = false;
  let historyItems = [];
  let audioContext = null;
  let analyser = null;
  let audioSource = null;
  let animationFrameId = null;

  // Presets Data
  const PRESETS = {
    blog: `One call to the cheap model, with the three defences its quirks require.

The function ask, taking prompt, schema equals None, model equals FLASH, returning Answer.

agy, the Antigravity CLI on the Google AI Pro subscription, is the generation half of this project: it writes content, and the engine — which has no judgment by design — renders it. Claude is not in this path; it is for introspection and debugging, which is the whole point of the split.

Three things about agy are load-bearing and were each found by it going wrong, so none of them may be quietly removed:

1. It is an AGENT, not a completion endpoint. Left alone it tries to run shell commands, gets denied, and spends its only turn doing it — returning an EMPTY response with status SUCCESS. NO_TOOLS is prepended to every prompt.

2. json-schema is not enforcement; it is implemented as a tool call. The response is prose that may contain SEVERAL concatenated JSON objects — a draft, then the tool payloads — and the payloads carry toolAction and toolSummary keys that are in nobody's schema. objects() pulls them all out and ask keeps the last one that actually validates.

3. It "repairs" a schema violation by mutilating the content. Asked for three items it drafted four, then dropped one AND changed initialCapacity 4 to 3 so the array lab lost the free slot it exists to show. Schema-valid, wrong. Hence check equals: a caller passes the semantic rule the schema cannot state, and a violation is a raised error, not a warning nobody reads.`,
    tech: `Welcome to Nari Qwen3-TTS, running high-performance neural voice synthesis locally on Apple Silicon. This serving engine delivers ultra-low latency audio generation with expressive custom voices.`,
    short: `Hello! This is Qwen3 TTS running smoothly on Apple Silicon.`
  };

  // Initial preset
  speechInput.value = PRESETS.short;
  updateCharCount();

  // 1. Health Check
  async function checkBackendHealth() {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data = await res.json();
        if (data.alive) {
          backendStatusBadge.classList.remove('error');
          statusLabel.textContent = 'Server Ready (Port 8000)';
          return true;
        }
      }
      throw new Error('Server not ready');
    } catch (err) {
      // Try absolute localhost if running standalone
      try {
        const res2 = await fetch('http://127.0.0.1:8000/health');
        if (res2.ok) {
          backendStatusBadge.classList.remove('error');
          statusLabel.textContent = 'Connected (Port 8000)';
          return true;
        }
      } catch (e) {}
      backendStatusBadge.classList.add('error');
      statusLabel.textContent = 'Server Offline';
      return false;
    }
  }
  checkBackendHealth();
  setInterval(checkBackendHealth, 10000);

  // 2. Voice Selection
  voiceCards.forEach(card => {
    card.addEventListener('click', () => {
      voiceCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectedVoice = card.getAttribute('data-voice');
      selectedVoiceBadge.textContent = card.querySelector('.voice-name').textContent;
    });
  });

  // 3. Preset Buttons
  sampleBtnBlog.addEventListener('click', () => {
    speechInput.value = PRESETS.blog;
    updateCharCount();
  });
  sampleBtnTech.addEventListener('click', () => {
    speechInput.value = PRESETS.tech;
    updateCharCount();
  });
  sampleBtnShort.addEventListener('click', () => {
    speechInput.value = PRESETS.short;
    updateCharCount();
  });

  // 4. Character Count & Clear
  function updateCharCount() {
    charCount.textContent = `${speechInput.value.length} characters`;
  }
  speechInput.addEventListener('input', updateCharCount);
  clearBtn.addEventListener('click', () => {
    speechInput.value = '';
    updateCharCount();
    speechInput.focus();
  });

  // 5. Text Normalizer
  function cleanMarkdown(text) {
    return text
      .replace(/^(#+)\s*/gm, '')      // strip markdown header hashes (# Heading)
      .replace(/`([^`]+)`/g, '$1')     // strip backticks (`code` -> code)
      .replace(/->/g, 'to')            // convert arrows -> to 'to'
      .replace(/--([a-zA-Z0-9_-]+)/g, '$1') // strip CLI flag dashes
      .replace(/([a-zA-Z0-9_]+)\//g, '$1') // strip trailing directory slashes (engine/ -> engine)
      .trim();
  }

  // 6. Synthesize Speech Action
  synthesizeBtn.addEventListener('click', async () => {
    const rawText = speechInput.value.trim();
    if (!rawText || isGenerating) return;

    const finalText = markdownToggle.checked ? cleanMarkdown(rawText) : rawText;

    isGenerating = true;
    synthesizeBtn.disabled = true;
    btnSpinner.classList.remove('hidden');
    btnIcon.classList.add('hidden');
    btnText.textContent = 'Synthesizing...';
    playerMeta.textContent = 'Generating neural audio on Apple Silicon...';

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
      const durationSec = ((performance.now() - startTime) / 1000).toFixed(1);
      const audioUrl = URL.createObjectURL(blob);

      loadAudio(audioUrl, {
        text: rawText,
        voice: selectedVoice,
        lang: languageSelect.value,
        sizeKb: (blob.size / 1024).toFixed(1),
        genTime: durationSec
      });

      // Add to history
      addToHistory({
        url: audioUrl,
        text: rawText,
        voice: selectedVoice,
        timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

    } catch (err) {
      console.error(err);
      playerMeta.textContent = `Synthesis error: ${err.message}`;
      alert(`Synthesis Failed: ${err.message}\nMake sure the local server is running on http://127.0.0.1:8000`);
    } finally {
      isGenerating = false;
      synthesizeBtn.disabled = false;
      btnSpinner.classList.add('hidden');
      btnIcon.classList.remove('hidden');
      btnText.textContent = 'Generate Speech';
    }
  });

  // 7. Audio Player Management
  function loadAudio(url, meta) {
    nativeAudio.src = url;
    downloadAudioBtn.href = url;
    downloadAudioBtn.classList.remove('disabled');
    downloadAudioBtn.download = `qwen3_${meta.voice}_${Date.now()}.wav`;

    playerMeta.textContent = `Voice: ${capitalize(meta.voice)} • Size: ${meta.sizeKb} KB • Generated in ${meta.genTime}s`;
    waveformPlaceholder.classList.add('hidden');

    playPauseBtn.disabled = false;
    seekSlider.disabled = false;

    nativeAudio.onloadedmetadata = () => {
      totalDurationDisplay.textContent = formatTime(nativeAudio.duration);
    };

    // Auto play
    playAudio();
  }

  function playAudio() {
    initAudioContext();
    nativeAudio.play().then(() => {
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
      startWaveform();
    }).catch(e => console.log('Autoplay prevented:', e));
  }

  function pauseAudio() {
    nativeAudio.pause();
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    stopWaveform();
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
      currentTimeDisplay.textContent = formatTime(nativeAudio.currentTime);
    }
  });

  nativeAudio.addEventListener('ended', () => {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    seekSlider.value = 0;
    currentTimeDisplay.textContent = '0:00';
    stopWaveform();
  });

  seekSlider.addEventListener('input', () => {
    if (!isNaN(nativeAudio.duration)) {
      nativeAudio.currentTime = (seekSlider.value / 100) * nativeAudio.duration;
    }
  });

  volumeSlider.addEventListener('input', () => {
    nativeAudio.volume = volumeSlider.value;
  });

  // 8. Waveform Visualizer
  function initAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioSource = audioContext.createMediaElementSource(nativeAudio);
      audioSource.connect(analyser);
      analyser.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }

  function startWaveform() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    function draw() {
      animationFrameId = requestAnimationFrame(draw);
      const width = waveformCanvas.width;
      const height = waveformCanvas.height;

      canvasCtx.clearRect(0, 0, width, height);

      if (analyser && !nativeAudio.paused) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const barWidth = (width / bufferLength) * 2.2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height * 0.85;

          const gradient = canvasCtx.createLinearGradient(0, height, 0, height - barHeight);
          gradient.addColorStop(0, '#6366f1');
          gradient.addColorStop(0.5, '#8b5cf6');
          gradient.addColorStop(1, '#ec4899');

          canvasCtx.fillStyle = gradient;
          canvasCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

          x += barWidth;
        }
      } else {
        // Flat baseline
        canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        canvasCtx.lineWidth = 1;
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, height / 2);
        canvasCtx.lineTo(width, height / 2);
        canvasCtx.stroke();
      }
    }
    draw();
  }

  function stopWaveform() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    // Draw flat line
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    canvasCtx.clearRect(0, 0, width, height);
    canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, height / 2);
    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
  }

  // 9. History Management
  function addToHistory(item) {
    historyItems.unshift(item);
    if (historyItems.length > 8) historyItems.pop();
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
    historyList.innerHTML = '';

    historyItems.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <div class="history-item-left">
          <span class="history-item-text">${escapeHtml(item.text)}</span>
          <span class="history-item-details">Voice: ${capitalize(item.voice)} • ${item.timeStr}</span>
        </div>
        <button type="button" class="history-play-btn">Replay</button>
      `;

      div.querySelector('.history-play-btn').addEventListener('click', () => {
        loadAudio(item.url, {
          text: item.text,
          voice: item.voice,
          sizeKb: '-',
          genTime: '-'
        });
      });

      historyList.appendChild(div);
    });
  }

  // Helpers
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
