/**
 * Nari Qwen3-TTS — Neural Acoustic Studio Controller
 * Powered by Stitch-generated "Neural Acoustic Studio" Design System
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Header & Telemetry Elements ---
  const systemStatusPill = document.getElementById('system-status-pill');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const topGenerateBtn = document.getElementById('top-generate-btn');
  const topDownloadBtn = document.getElementById('top-download-btn');

  // --- Voice Selection & Filtering ---
  const voiceCards = document.querySelectorAll('.voice-card');
  const filterTabs = document.querySelectorAll('.filter-tab');

  const VOICE_META = {
    ryan: { name: 'Ryan', gender: 'male', tone: 'Expressive, Rich Tone', code: 'RY' },
    serena: { name: 'Serena', gender: 'female', tone: 'Warm Narrative, Storytelling', code: 'SR' },
    aiden: { name: 'Aiden', gender: 'male', tone: 'Baritone, Deep & Steady', code: 'AD' },
    vivian: { name: 'Vivian', gender: 'female', tone: 'Bright, Dynamic & Friendly', code: 'VV' },
    eric: { name: 'Eric', gender: 'male', tone: 'Casual, Conversational', code: 'EC' },
    dylan: { name: 'Dylan', gender: 'male', tone: 'Calm, Meditative & Smooth', code: 'DL' },
    sohee: { name: 'Sohee', gender: 'female', tone: 'Refined, Crisp & Clear', code: 'SH' },
    ono_anna: { name: 'Ono Anna', gender: 'female', tone: 'Melodic, Japanese Polyglot', code: 'OA' },
    uncle_fu: { name: 'Uncle Fu', gender: 'male', tone: 'Authoritative & Resonant', code: 'UF' }
  };

  // --- Acoustic Settings & Sliders ---
  const languageSelect = document.getElementById('language-select');
  const paceSlider = document.getElementById('pace-slider');
  const paceVal = document.getElementById('pace-val');
  const tempSlider = document.getElementById('temp-slider');
  const tempVal = document.getElementById('temp-val');
  const markdownToggle = document.getElementById('markdown-cleaner-toggle');

  // --- Script Studio Elements ---
  const speechInput = document.getElementById('speech-input');
  const charCount = document.getElementById('char-count');
  const wordCount = document.getElementById('word-count');
  const estDuration = document.getElementById('est-duration');
  const clearBtn = document.getElementById('clear-btn');
  const synthesizeBtn = document.getElementById('synthesize-btn');
  const btnSpinner = document.getElementById('btn-spinner');
  const btnIcon = document.getElementById('btn-icon');
  const btnLabel = document.getElementById('btn-label');

  // --- Presets ---
  const presetBlog = document.getElementById('preset-blog');
  const presetTech = document.getElementById('preset-tech');
  const presetGreeting = document.getElementById('preset-greeting');

  // --- Playback Deck Elements ---
  const deckMetaInfo = document.getElementById('deck-meta-info');
  const nativeAudio = document.getElementById('native-audio');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const rewindBtn = document.getElementById('rewind-btn');
  const forwardBtn = document.getElementById('forward-btn');
  const seekSlider = document.getElementById('seek-slider');
  const currentTimeEl = document.getElementById('current-time');
  const totalDurationEl = document.getElementById('total-duration');
  const volumeSlider = document.getElementById('volume-slider');
  const muteBtn = document.getElementById('mute-btn');
  const volumeIcon = document.getElementById('volume-icon');
  const downloadAudioBtn = document.getElementById('download-audio-btn');
  const speedBtns = document.querySelectorAll('.speed-btn');
  const visualizerIdleNotice = document.getElementById('visualizer-idle-notice');
  const waveformCanvas = document.getElementById('waveform-canvas');
  const canvasCtx = waveformCanvas ? waveformCanvas.getContext('2d') : null;

  // --- History Elements ---
  const historyCount = document.getElementById('history-count');
  const historyFeed = document.getElementById('history-feed');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  // --- State Variables ---
  let selectedVoice = 'serena'; // Default Serena from Stitch design
  let isGenerating = false;
  let historyItems = [];
  let audioContext = null;
  let analyser = null;
  let audioSource = null;
  let idlePhase = 0;
  let currentSpeed = 1.0;
  let previousVolume = 0.84;

  // --- Presets Content ---
  const PRESETS = {
    blog: `The Qwen3-TTS architecture integrates non-autoregressive latent diffusion with an ultra-low latency acoustic tokenizer. By leveraging dense speaker embeddings and conditioning vectors, the neural engine preserves vocal warmth, natural dynamic breathing pauses, and inflection contours across diverse syntactic boundaries without artifacting.`,
    tech: `Welcome to Nari Qwen3-TTS, running high-performance neural voice synthesis locally on Apple Silicon. With 24kHz 16-bit Float PCM output and Metal Performance Shaders acceleration, this serving engine delivers studio-quality speech with instantaneous response.`,
    greeting: `Hello! This is Qwen3 TTS running smoothly on Apple Silicon with studio-grade neural voice synthesis.`
  };

  // Set default initial text if empty
  if (speechInput && !speechInput.value.trim()) {
    speechInput.value = PRESETS.blog;
  }
  updateStats();

  // --- Resize Canvas for Waveform ---
  function resizeCanvas() {
    if (waveformCanvas && waveformCanvas.parentElement) {
      waveformCanvas.width = waveformCanvas.parentElement.clientWidth;
      waveformCanvas.height = waveformCanvas.parentElement.clientHeight || 80;
    }
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // 1. Backend Server Health Monitor
  async function checkBackendHealth() {
    const healthUrl = window.location.port === '8000' ? '/health' : 'http://127.0.0.1:8000/health';
    try {
      const res = await fetch(healthUrl, { method: 'GET', signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const data = await res.json();
        if (data.alive) {
          if (systemStatusPill) {
            systemStatusPill.className = 'hidden lg:flex items-center space-x-space-xs px-2.5 py-1 rounded-full bg-surface-container-lowest border border-outline-variant/30 font-label-mono-sm text-label-mono-sm';
          }
          if (statusDot) {
            statusDot.className = 'w-2 h-2 rounded-full bg-tertiary neon-pulse';
          }
          if (statusText) {
            statusText.className = 'text-tertiary font-medium';
            statusText.textContent = 'Engine Online';
          }
          return true;
        }
      }
      throw new Error('Offline');
    } catch {
      if (statusDot) {
        statusDot.className = 'w-2 h-2 rounded-full bg-error';
      }
      if (statusText) {
        statusText.className = 'text-error font-medium';
        statusText.textContent = 'Engine Offline';
      }
      return false;
    }
  }
  checkBackendHealth();
  setInterval(checkBackendHealth, 10000);

  // 2. Voice Selection UI Handling
  function selectVoice(voiceKey) {
    if (!VOICE_META[voiceKey]) return;
    selectedVoice = voiceKey;
    const meta = VOICE_META[voiceKey];

    voiceCards.forEach(card => {
      const isCurrent = card.getAttribute('data-voice') === voiceKey;
      const badge = card.querySelector('.active-badge');

      if (isCurrent) {
        card.classList.add('active', 'border-2', 'border-primary-container', 'violet-glow');
        card.classList.remove('border-outline-variant/30', 'hover:border-outline-variant/70', 'hover:bg-surface-container-high');
        if (!badge) {
          const newBadge = document.createElement('div');
          newBadge.className = 'active-badge absolute -top-2 -right-1 px-1.5 py-0.2 rounded-full bg-primary-container text-on-primary font-label-mono-sm text-[9px] font-bold tracking-wider uppercase shadow-sm';
          newBadge.textContent = 'Active';
          card.appendChild(newBadge);
        }
      } else {
        card.classList.remove('active', 'border-2', 'border-primary-container', 'violet-glow');
        card.classList.add('border-outline-variant/30', 'hover:border-outline-variant/70', 'hover:bg-surface-container-high');
        if (badge) badge.remove();
      }
    });

    if (deckMetaInfo) {
      deckMetaInfo.textContent = `• ${meta.name} (${meta.tone})`;
    }
  }

  voiceCards.forEach(card => {
    card.addEventListener('click', () => {
      const v = card.getAttribute('data-voice');
      if (v) selectVoice(v);
    });
  });

  // 3. Gender Filter Tabs
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => {
        t.className = 'filter-tab px-2.5 py-1 rounded text-on-surface-variant hover:text-on-surface font-label-mono-sm text-label-mono-sm transition-colors';
      });
      tab.className = 'filter-tab px-2.5 py-1 rounded bg-surface-container-high text-on-surface font-label-mono-sm text-label-mono-sm font-medium transition-colors';

      const filter = tab.getAttribute('data-filter');
      voiceCards.forEach(card => {
        const g = card.getAttribute('data-gender');
        if (filter === 'all' || g === filter) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // 4. Sliders Interaction
  if (paceSlider && paceVal) {
    paceSlider.addEventListener('input', (e) => {
      paceVal.textContent = `${parseFloat(e.target.value).toFixed(2)}x`;
    });
  }
  if (tempSlider && tempVal) {
    tempSlider.addEventListener('input', (e) => {
      tempVal.textContent = `${parseFloat(e.target.value).toFixed(2)}`;
    });
  }

  // 5. Presets
  if (presetBlog) {
    presetBlog.addEventListener('click', () => {
      speechInput.value = PRESETS.blog;
      updateStats();
      speechInput.focus();
    });
  }
  if (presetTech) {
    presetTech.addEventListener('click', () => {
      speechInput.value = PRESETS.tech;
      updateStats();
      speechInput.focus();
    });
  }
  if (presetGreeting) {
    presetGreeting.addEventListener('click', () => {
      speechInput.value = PRESETS.greeting;
      updateStats();
      speechInput.focus();
    });
  }

  // 6. Character, Word & Duration Estimator
  function updateStats() {
    if (!speechInput) return;
    const text = speechInput.value.trim();
    const len = speechInput.value.length;
    const words = text ? text.split(/\s+/).length : 0;

    if (charCount) charCount.textContent = `${len} characters`;
    if (wordCount) wordCount.textContent = `${words} words`;
    const estSec = len > 0 ? (len / 16).toFixed(1) : '0.0';
    if (estDuration) estDuration.textContent = `~${estSec}s estimated audio`;
  }
  if (speechInput) speechInput.addEventListener('input', updateStats);

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      speechInput.value = '';
      updateStats();
      speechInput.focus();
    });
  }

  // Keyboard shortcut: Cmd/Ctrl + Enter
  if (speechInput) {
    speechInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        triggerSynthesis();
      }
    });
  }

  if (topGenerateBtn) {
    topGenerateBtn.addEventListener('click', () => {
      triggerSynthesis();
    });
  }

  if (synthesizeBtn) {
    synthesizeBtn.addEventListener('click', () => {
      triggerSynthesis();
    });
  }

  // 7. Markdown Cleaner (Acoustic Guard)
  function cleanMarkdown(text) {
    return text
      .replace(/```[\s\S]*?```/g, ' [code omitted] ') // code blocks
      .replace(/^#{1,6}\s+/gm, '')                     // headings
      .replace(/\*\*([^*]+)\*\*/g, '$1')              // bold
      .replace(/\*([^*]+)\*/g, '$1')                  // italics
      .replace(/`([^`]+)`/g, '$1')                    // inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')         // markdown links
      .replace(/https?:\/\/\S+/g, '')                 // raw URLs
      .replace(/->/g, 'to')                           // arrows
      .replace(/--([a-zA-Z0-9_-]+)/g, '$1')           // CLI flags
      .replace(/([a-zA-Z0-9_]+)\//g, '$1 ')           // path slashes
      .replace(/\s+/g, ' ')                           // excess whitespace
      .trim();
  }

  // 8. Synthesis Execution
  async function triggerSynthesis() {
    const rawText = speechInput ? speechInput.value.trim() : '';
    if (!rawText || isGenerating) return;

    const useCleaner = markdownToggle ? markdownToggle.checked : true;
    const finalText = useCleaner ? cleanMarkdown(rawText) : rawText;

    isGenerating = true;
    if (synthesizeBtn) synthesizeBtn.disabled = true;
    if (topGenerateBtn) topGenerateBtn.disabled = true;
    if (btnSpinner) btnSpinner.classList.remove('hidden');
    if (btnIcon) btnIcon.classList.add('hidden');
    if (btnLabel) btnLabel.textContent = 'Synthesizing...';
    if (deckMetaInfo) {
      deckMetaInfo.textContent = `• Generating audio with ${VOICE_META[selectedVoice]?.name || selectedVoice}...`;
    }

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
          language: languageSelect ? languageSelect.value : 'english',
          response_format: 'wav',
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);
      const audioUrl = URL.createObjectURL(blob);

      loadAudio(audioUrl, {
        text: rawText,
        voice: selectedVoice,
        lang: languageSelect ? languageSelect.value : 'english',
        sizeKb: (blob.size / 1024).toFixed(1),
        genTime: elapsedSec
      });

      addToHistory({
        url: audioUrl,
        text: rawText,
        voice: selectedVoice,
        sizeKb: (blob.size / 1024).toFixed(1),
        timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

    } catch (err) {
      console.error('Synthesis error:', err);
      if (deckMetaInfo) deckMetaInfo.textContent = `• Error: ${err.message}`;
      alert(`Synthesis Failed: ${err.message}\nMake sure the local engine backend is running (port 8000).`);
    } finally {
      isGenerating = false;
      if (synthesizeBtn) synthesizeBtn.disabled = false;
      if (topGenerateBtn) topGenerateBtn.disabled = false;
      if (btnSpinner) btnSpinner.classList.add('hidden');
      if (btnIcon) btnIcon.classList.remove('hidden');
      if (btnLabel) btnLabel.textContent = 'Generate Speech';
    }
  }

  // 9. Audio Player & Playback Deck
  function loadAudio(url, meta) {
    if (!nativeAudio) return;
    nativeAudio.src = url;
    nativeAudio.playbackRate = currentSpeed;

    if (downloadAudioBtn) {
      downloadAudioBtn.href = url;
      downloadAudioBtn.download = `qwen3_${meta.voice}_${Date.now()}.wav`;
    }
    if (topDownloadBtn) {
      topDownloadBtn.href = url;
      topDownloadBtn.download = `qwen3_${meta.voice}_${Date.now()}.wav`;
    }

    const voiceName = VOICE_META[meta.voice]?.name || meta.voice;
    if (deckMetaInfo) {
      deckMetaInfo.textContent = `• ${voiceName} (${meta.sizeKb} KB in ${meta.genTime}s)`;
    }
    if (visualizerIdleNotice) {
      visualizerIdleNotice.classList.add('hidden');
    }

    if (playPauseBtn) playPauseBtn.disabled = false;
    if (seekSlider) seekSlider.disabled = false;

    nativeAudio.onloadedmetadata = () => {
      if (totalDurationEl) totalDurationEl.textContent = formatTime(nativeAudio.duration);
    };

    playAudio();
  }

  function playAudio() {
    if (!nativeAudio) return;
    initAudioContext();
    nativeAudio.play().then(() => {
      if (iconPlay) iconPlay.classList.add('hidden');
      if (iconPause) iconPause.classList.remove('hidden');
      if (visualizerIdleNotice) visualizerIdleNotice.classList.add('hidden');
    }).catch(e => console.log('Autoplay deferred:', e));
  }

  function pauseAudio() {
    if (!nativeAudio) return;
    nativeAudio.pause();
    if (iconPlay) iconPlay.classList.remove('hidden');
    if (iconPause) iconPause.classList.add('hidden');
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      if (!nativeAudio.src) return;
      if (nativeAudio.paused) {
        playAudio();
      } else {
        pauseAudio();
      }
    });
  }

  if (rewindBtn) {
    rewindBtn.addEventListener('click', () => {
      if (nativeAudio && !isNaN(nativeAudio.duration)) {
        nativeAudio.currentTime = Math.max(0, nativeAudio.currentTime - 5);
      }
    });
  }

  if (forwardBtn) {
    forwardBtn.addEventListener('click', () => {
      if (nativeAudio && !isNaN(nativeAudio.duration)) {
        nativeAudio.currentTime = Math.min(nativeAudio.duration, nativeAudio.currentTime + 5);
      }
    });
  }

  if (nativeAudio) {
    nativeAudio.addEventListener('timeupdate', () => {
      if (!isNaN(nativeAudio.duration) && nativeAudio.duration > 0) {
        const pct = (nativeAudio.currentTime / nativeAudio.duration) * 100;
        if (seekSlider) seekSlider.value = pct;
        if (currentTimeEl) currentTimeEl.textContent = formatTime(nativeAudio.currentTime);
      }
    });

    nativeAudio.addEventListener('ended', () => {
      if (iconPlay) iconPlay.classList.remove('hidden');
      if (iconPause) iconPause.classList.add('hidden');
      if (seekSlider) seekSlider.value = 0;
      if (currentTimeEl) currentTimeEl.textContent = '00:00.0';
    });
  }

  if (seekSlider) {
    seekSlider.addEventListener('input', () => {
      if (nativeAudio && !isNaN(nativeAudio.duration)) {
        nativeAudio.currentTime = (seekSlider.value / 100) * nativeAudio.duration;
      }
    });
  }

  // Speed controls
  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => {
        b.className = 'speed-btn px-2 py-0.5 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-mono-sm text-label-mono-sm transition-colors';
      });
      btn.className = 'speed-btn px-2 py-0.5 rounded bg-secondary text-on-secondary font-label-mono-sm text-label-mono-sm font-semibold transition-colors';
      currentSpeed = parseFloat(btn.getAttribute('data-speed')) || 1.0;
      if (nativeAudio) nativeAudio.playbackRate = currentSpeed;
    });
  });

  // Volume & Mute
  if (volumeSlider && nativeAudio) {
    nativeAudio.volume = parseFloat(volumeSlider.value) / 100;
    volumeSlider.addEventListener('input', () => {
      const vol = parseFloat(volumeSlider.value) / 100;
      nativeAudio.volume = vol;
      nativeAudio.muted = (vol === 0);
      updateVolumeIcon(vol);
    });
  }

  function updateVolumeIcon(vol) {
    if (!volumeIcon) return;
    if (vol === 0 || nativeAudio.muted) {
      volumeIcon.textContent = 'volume_off';
    } else if (vol < 0.5) {
      volumeIcon.textContent = 'volume_down';
    } else {
      volumeIcon.textContent = 'volume_up';
    }
  }

  if (muteBtn && nativeAudio && volumeSlider) {
    muteBtn.addEventListener('click', () => {
      nativeAudio.muted = !nativeAudio.muted;
      if (nativeAudio.muted) {
        previousVolume = parseFloat(volumeSlider.value);
        volumeSlider.value = 0;
        updateVolumeIcon(0);
      } else {
        volumeSlider.value = previousVolume > 0 ? previousVolume : 84;
        nativeAudio.volume = parseFloat(volumeSlider.value) / 100;
        updateVolumeIcon(nativeAudio.volume);
      }
    });
  }

  // 10. High-Resolution Audio Waveform Visualizer
  function initAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      if (nativeAudio) {
        audioSource = audioContext.createMediaElementSource(nativeAudio);
        audioSource.connect(analyser);
        analyser.connect(audioContext.destination);
      }
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }

  function renderVisualizer() {
    if (!waveformCanvas || !canvasCtx) return;
    const w = waveformCanvas.width;
    const h = waveformCanvas.height;

    canvasCtx.clearRect(0, 0, w, h);

    if (analyser && nativeAudio && !nativeAudio.paused) {
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const barCount = 48;
      const step = Math.floor(bufferLength / barCount);
      const totalBarWidth = w / barCount;
      const barWidth = Math.max(2, totalBarWidth - 3);

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] || 0;
        const barHeight = Math.max(4, (val / 255) * h * 0.88);
        const x = i * totalBarWidth + 1;
        const y = (h - barHeight) / 2;

        // Dynamic gradient using Stitch palette: Cyan to Violet
        const grad = canvasCtx.createLinearGradient(0, y, 0, y + barHeight);
        grad.addColorStop(0, '#4cd7f6');  // Electric cyan
        grad.addColorStop(0.5, '#a078ff'); // Neural violet
        grad.addColorStop(1, '#4edea3');  // Phonic emerald

        canvasCtx.fillStyle = grad;
        canvasCtx.beginPath();
        canvasCtx.roundRect(x, y, barWidth, barHeight, 2);
        canvasCtx.fill();
      }
    } else {
      // Ambient Idle Harmonic Wave
      idlePhase += 0.03;
      const midY = h / 2;

      // Draw subtle bar baseline
      const barCount = 40;
      const totalBarWidth = w / barCount;
      const barWidth = Math.max(2, totalBarWidth - 4);

      for (let i = 0; i < barCount; i++) {
        const wave = Math.sin(i * 0.25 + idlePhase) * 6 + Math.sin(i * 0.1 - idlePhase * 0.5) * 4;
        const barHeight = Math.max(3, 8 + wave);
        const x = i * totalBarWidth + 2;
        const y = midY - barHeight / 2;

        canvasCtx.fillStyle = 'rgba(76, 215, 246, 0.18)';
        canvasCtx.beginPath();
        canvasCtx.roundRect(x, y, barWidth, barHeight, 1.5);
        canvasCtx.fill();
      }
    }

    requestAnimationFrame(renderVisualizer);
  }
  renderVisualizer();

  // 11. Recent Generations History Feed
  function addToHistory(item) {
    historyItems.unshift(item);
    if (historyItems.length > 8) historyItems.pop();
    renderHistory();
  }

  function renderHistory() {
    if (!historyFeed) return;
    if (historyCount) historyCount.textContent = `${historyItems.length}`;

    if (historyItems.length === 0) {
      historyFeed.innerHTML = `
        <div class="py-6 text-center text-outline font-label-mono-sm text-label-mono-sm">
          No recent generations yet. Synthesize speech to see history.
        </div>
      `;
      return;
    }

    historyFeed.innerHTML = '';

    historyItems.forEach((item, index) => {
      const vMeta = VOICE_META[item.voice] || { name: item.voice, code: item.voice.slice(0, 2).toUpperCase() };
      const row = document.createElement('div');
      row.className = 'py-2.5 flex items-center justify-between group hover:bg-surface-container/50 px-2 rounded-lg transition-colors border-b border-outline-variant/10 last:border-0';

      row.innerHTML = `
        <div class="flex items-center space-x-3">
          <button class="hist-play-btn w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center hover:bg-primary hover:text-on-primary transition-colors cursor-pointer" title="Replay">
            <span class="material-symbols-outlined" style="font-size: 16px;">play_arrow</span>
          </button>
          <div class="flex flex-col">
            <div class="flex items-center space-x-2">
              <span class="font-body-sm text-body-sm font-medium text-on-surface truncate max-w-[280px] sm:max-w-md">${escapeHtml(item.text.slice(0, 48))}${item.text.length > 48 ? '...' : ''}</span>
              <span class="px-1.5 py-0.2 rounded bg-surface-container-highest text-primary font-label-mono-sm text-[10px]">${vMeta.name}</span>
            </div>
            <div class="flex items-center space-x-2 font-label-mono-sm text-label-mono-sm text-outline mt-0.5">
              <span>${item.sizeKb ? item.sizeKb + ' KB' : 'WAV'}</span>
              <span>•</span>
              <span>${item.timeStr}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <a href="${item.url}" download="qwen3_${item.voice}_${Date.now()}.wav" class="p-1.5 rounded hover:bg-surface-container-highest text-outline hover:text-secondary transition-colors cursor-pointer" title="Download WAV">
            <span class="material-symbols-outlined">download</span>
          </a>
        </div>
      `;

      const playBtn = row.querySelector('.hist-play-btn');
      if (playBtn) {
        playBtn.addEventListener('click', () => {
          loadAudio(item.url, {
            text: item.text,
            voice: item.voice,
            sizeKb: item.sizeKb || '-',
            genTime: '-'
          });
        });
      }

      historyFeed.appendChild(row);
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      historyItems = [];
      renderHistory();
    });
  }

  // 12. Format Helpers
  function formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '00:00.0';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }
});
