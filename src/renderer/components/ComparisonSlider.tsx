import React, { useRef, useState, useCallback, useEffect } from 'react';

interface Props {
  beforeSrc: string;
  afterSrc: string;
  fitMode: 'fit' | '1:1';
}

export function ComparisonSlider({ beforeSrc, afterSrc, fitMode }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });
  const [zoom, setZoom] = useState(1);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  // Load image dimensions
  useEffect(() => {
    const img = new Image();
    img.onload = () => setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = afterSrc;
  }, [afterSrc]);

  // Reset view when mode changes
  useEffect(() => {
    if (fitMode === 'fit') {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else if (imageSize.width > 0 && containerRef.current) {
      // 1:1 mode: zoom to actual pixels
      const rect = containerRef.current.getBoundingClientRect();
      const scaleX = imageSize.width / rect.width;
      const scaleY = imageSize.height / rect.height;
      setZoom(Math.max(scaleX, scaleY));
      setPan({ x: 0, y: 0 });
    }
  }, [fitMode, imageSize]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        // Middle click or Alt+click = pan
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
        e.preventDefault();
      } else if (e.button === 0) {
        // Left click = drag slider
        setIsDragging(true);
        updateSliderPos(e);
      }
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPan({
          x: panStart.panX + (e.clientX - panStart.x),
          y: panStart.panY + (e.clientY - panStart.y),
        });
      } else if (isDragging) {
        updateSliderPos(e);
      }
    },
    [isDragging, isPanning, panStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (fitMode !== '1:1') return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.max(0.1, Math.min(z * delta, 20)));
    },
    [fitMode],
  );

  function updateSliderPos(e: React.MouseEvent): void {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, x)));
  }

  const imgStyle: React.CSSProperties =
    fitMode === 'fit'
      ? {
          width: '100%',
          height: '100%',
          objectFit: 'contain' as const,
        }
      : {
          width: `${zoom * 100}%`,
          height: `${zoom * 100}%`,
          objectFit: 'none' as const,
          objectPosition: 'center',
          transform: `translate(${pan.x}px, ${pan.y}px)`,
        };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : fitMode === '1:1' ? 'grab' : 'col-resize',
        userSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Before image (full) */}
      <img
        src={beforeSrc}
        alt="Before"
        draggable={false}
        style={{ ...imgStyle, position: 'absolute', top: 0, left: 0 }}
      />
      {/* After image (clipped by slider) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          clipPath: `inset(0 ${100 - sliderPos}% 0 0)`,
        }}
      >
        <img
          src={afterSrc}
          alt="After"
          draggable={false}
          style={{ ...imgStyle, position: 'absolute', top: 0, left: 0 }}
        />
      </div>
      {/* Slider line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: `${sliderPos}%`,
          width: 2,
          height: '100%',
          backgroundColor: '#fff',
          boxShadow: '0 0 4px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
      {/* Slider handle */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: `${sliderPos}%`,
          transform: 'translate(-50%, -50%)',
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          pointerEvents: 'none',
          zIndex: 11,
        }}
      >
        {'<>'}
      </div>
      {/* Labels */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          padding: '2px 8px',
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          fontSize: 12,
          borderRadius: 4,
          zIndex: 12,
        }}
      >
        Before
      </div>
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          padding: '2px 8px',
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          fontSize: 12,
          borderRadius: 4,
          zIndex: 12,
        }}
      >
        After
      </div>
    </div>
  );
}
