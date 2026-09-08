import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ComparisonSlider } from './components/ComparisonSlider';
import type { AppSettings, UpscaleRequest } from '../shared/ipc';
import type { ScaleFactor, OutputFormat } from '../shared/types';

type AppState = 'idle' | 'processing' | 'done' | 'error';

export function App(): React.ReactElement {
  const [state, setState] = useState<AppState>('idle');
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [inputDataUrl, setInputDataUrl] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [outputDataUrl, setOutputDataUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [fitMode, setFitMode] = useState<'fit' | '1:1'>('fit');
  const dropRef = useRef<HTMLDivElement>(null);

  // Load settings on mount
  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  // Subscribe to progress
  useEffect(() => {
    const cleanup = window.api.onProgress((event) => {
      setProgress(event.percent);
      if (event.message) setProgressMsg(event.message);
    });
    return cleanup;
  }, []);

  // Read image file via IPC (renderer can't access file:// directly)
  const readImage = useCallback(async (filePath: string): Promise<string> => {
    return window.api.readImage(filePath);
  }, []);

  const loadImage = useCallback(
    async (filePath: string) => {
      setInputPath(filePath);
      const url = await readImage(filePath);
      setInputDataUrl(url);
      setOutputPath(null);
      setOutputDataUrl(null);
      setState('idle');
      setErrorMsg('');
    },
    [readImage],
  );

  // Drag and drop
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0] as File & { path?: string };
        if (file.path) loadImage(file.path);
      }
    };

    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', handleDrop);
    return () => {
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('drop', handleDrop);
    };
  }, [loadImage]);

  const handleOpenFile = useCallback(async () => {
    const filePath = await window.api.openFile();
    if (filePath) loadImage(filePath);
  }, [loadImage]);

  const handleUpscale = useCallback(async () => {
    if (!inputPath || !settings) return;

    setState('processing');
    setProgress(0);
    setProgressMsg('Starting...');
    setErrorMsg('');

    const request: UpscaleRequest = {
      inputPath,
      scale: settings.scale,
      model: settings.model,
      tileSize: settings.tileSize,
    };

    const result = await window.api.upscale(request);

    if (result.success && result.outputPath) {
      setOutputPath(result.outputPath);
      setElapsedMs(result.elapsedMs);
      const url = await readImage(result.outputPath);
      setOutputDataUrl(url);
      setState('done');
    } else {
      setErrorMsg(result.error || 'Unknown error');
      setState('error');
    }
  }, [inputPath, settings, readImage]);

  const handleCancel = useCallback(() => {
    window.api.cancel();
    setState('idle');
  }, []);

  const handleSave = useCallback(async () => {
    if (!outputPath || !settings) return;
    await window.api.save({
      sourcePath: outputPath,
      format: settings.outputFormat,
      jpegQuality: settings.jpegQuality,
    });
  }, [outputPath, settings]);

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      if (!settings) return;
      const updated = { ...settings, [key]: value };
      setSettings(updated);
      window.api.setSettings({ [key]: value });
    },
    [settings],
  );

  if (!settings) return <div style={styles.loading}>Loading...</div>;

  return (
    <div ref={dropRef} style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <h2 style={styles.title}>Upscaler Desktop</h2>

        {/* File input */}
        <div style={styles.section}>
          <button onClick={handleOpenFile} style={styles.button}>
            Open Image
          </button>
          {inputPath && (
            <div style={styles.fileInfo}>{inputPath.split(/[\\/]/).pop()}</div>
          )}
        </div>

        {/* Scale */}
        <div style={styles.section}>
          <label style={styles.label}>Scale</label>
          <select
            value={settings.scale}
            onChange={(e) => updateSetting('scale', Number(e.target.value) as ScaleFactor)}
            style={styles.select}
          >
            <option value={4}>4x</option>
            <option value={8}>8x</option>
            <option value={16}>16x</option>
          </select>
        </div>

        {/* Model */}
        <div style={styles.section}>
          <label style={styles.label}>Model</label>
          <select
            value={settings.model}
            onChange={(e) => updateSetting('model', e.target.value)}
            style={styles.select}
          >
            <option value="realesrgan-x4plus">RealESRGAN x4plus</option>
            <option value="realesrgan-x4plus-anime">RealESRGAN x4plus Anime</option>
            <option value="realesr-animevideov3">RealESR AnimevideV3</option>
          </select>
        </div>

        {/* Tile size */}
        <div style={styles.section}>
          <label style={styles.label}>Tile Size</label>
          <select
            value={settings.tileSize}
            onChange={(e) => updateSetting('tileSize', Number(e.target.value))}
            style={styles.select}
          >
            <option value={0}>Auto</option>
            <option value={128}>128</option>
            <option value={256}>256</option>
            <option value={512}>512</option>
          </select>
        </div>

        {/* Output format */}
        <div style={styles.section}>
          <label style={styles.label}>Output Format</label>
          <select
            value={settings.outputFormat}
            onChange={(e) => updateSetting('outputFormat', e.target.value as OutputFormat)}
            style={styles.select}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="tiff">TIFF</option>
          </select>
        </div>

        {/* JPEG quality */}
        {settings.outputFormat === 'jpeg' && (
          <div style={styles.section}>
            <label style={styles.label}>JPEG Quality: {settings.jpegQuality}</label>
            <input
              type="range"
              min={50}
              max={100}
              value={settings.jpegQuality}
              onChange={(e) => updateSetting('jpegQuality', Number(e.target.value))}
              style={styles.slider}
            />
          </div>
        )}

        {/* Action buttons */}
        <div style={{ ...styles.section, marginTop: 'auto' }}>
          {state === 'processing' ? (
            <button onClick={handleCancel} style={{ ...styles.button, ...styles.cancelButton }}>
              Cancel
            </button>
          ) : (
            <button
              onClick={handleUpscale}
              disabled={!inputPath}
              style={{
                ...styles.button,
                ...styles.primaryButton,
                opacity: inputPath ? 1 : 0.5,
              }}
            >
              Upscale {settings.scale}x
            </button>
          )}

          {state === 'done' && (
            <button onClick={handleSave} style={{ ...styles.button, marginTop: 8 }}>
              Save As...
            </button>
          )}
        </div>

        {/* Status */}
        {state === 'processing' && (
          <div style={styles.status}>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${progress}%` }} />
            </div>
            <div style={styles.progressText}>
              {progress.toFixed(0)}% {progressMsg && `- ${progressMsg}`}
            </div>
          </div>
        )}

        {state === 'done' && (
          <div style={{ ...styles.status, color: '#4caf50' }}>
            Done in {(elapsedMs / 1000).toFixed(1)}s
          </div>
        )}

        {state === 'error' && (
          <div style={{ ...styles.status, color: '#f44336' }}>{errorMsg}</div>
        )}
      </div>

      {/* Main content area */}
      <div style={styles.content}>
        {!inputPath && (
          <div style={styles.dropZone}>
            <div style={styles.dropIcon}>+</div>
            <div>Drop an image here or click Open Image</div>
          </div>
        )}

        {inputPath && !outputDataUrl && inputDataUrl && (
          <div style={styles.imageContainer}>
            <img
              src={inputDataUrl}
              alt="Input"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>
        )}

        {inputDataUrl && outputDataUrl && (
          <div style={styles.comparisonContainer}>
            <div style={styles.viewToggle}>
              <button
                onClick={() => setFitMode('fit')}
                style={{
                  ...styles.toggleButton,
                  ...(fitMode === 'fit' ? styles.toggleActive : {}),
                }}
              >
                Fit
              </button>
              <button
                onClick={() => setFitMode('1:1')}
                style={{
                  ...styles.toggleButton,
                  ...(fitMode === '1:1' ? styles.toggleActive : {}),
                }}
              >
                1:1
              </button>
            </div>
            <ComparisonSlider
              beforeSrc={inputDataUrl}
              afterSrc={outputDataUrl}
              fitMode={fitMode}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#1a1a2e',
    color: '#e0e0e0',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: '#888',
  },
  sidebar: {
    width: 260,
    minWidth: 260,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #2a2a4a',
    backgroundColor: '#16162a',
    overflow: 'auto',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 16,
    color: '#fff',
  },
  section: {
    marginBottom: 12,
  },
  label: {
    display: 'block',
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  select: {
    width: '100%',
    padding: '6px 8px',
    backgroundColor: '#2a2a4a',
    border: '1px solid #3a3a5a',
    borderRadius: 4,
    color: '#e0e0e0',
    fontSize: 13,
  },
  slider: {
    width: '100%',
  },
  button: {
    width: '100%',
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid #3a3a5a',
    backgroundColor: '#2a2a4a',
    color: '#e0e0e0',
    fontSize: 13,
    cursor: 'pointer',
  },
  primaryButton: {
    backgroundColor: '#4a6cf7',
    borderColor: '#4a6cf7',
    color: '#fff',
    fontWeight: 600,
  },
  cancelButton: {
    backgroundColor: '#c62828',
    borderColor: '#c62828',
    color: '#fff',
  },
  fileInfo: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    wordBreak: 'break-all' as const,
  },
  status: {
    fontSize: 12,
    marginTop: 8,
    color: '#888',
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#2a2a4a',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4a6cf7',
    transition: 'width 0.2s',
  },
  progressText: {
    fontSize: 11,
    color: '#888',
  },
  content: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  dropZone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: '#666',
    fontSize: 14,
  },
  dropIcon: {
    fontSize: 48,
    color: '#444',
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  comparisonContainer: {
    width: '100%',
    height: '100%',
    position: 'relative' as const,
  },
  viewToggle: {
    position: 'absolute' as const,
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 2,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    padding: 2,
  },
  toggleButton: {
    padding: '4px 12px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#aaa',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 4,
  },
  toggleActive: {
    backgroundColor: '#4a6cf7',
    color: '#fff',
  },
};
